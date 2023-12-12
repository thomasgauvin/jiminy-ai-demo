import { useEffect, useState } from 'react';
import Webcam from 'react-webcam';
import './App.css';
import { useRef } from 'react';
import OpenAI from 'openai';
import 'regenerator-runtime/runtime';
import SpeechRecognition, {
  useSpeechRecognition, //@ts-ignore
} from 'react-speech-recognition';

const OAI_INITIAL_SYSTEM_PROMPT: OpenAI.ChatCompletionSystemMessageParam = {
  role: 'system',
  content: `You are a friendly companion. Your objective is to be helpful and assist. These are frames of a video. Do not refer to frames as independent images, Respond to the user request. Answer in a single sentence as simple as possible. Keep the language simple. If it is a drawing, do not comment on the surface, only the drawing.`,
};

const OAI_USER_REQUEST_SYSTEM_PROMPT: OpenAI.ChatCompletionSystemMessageParam =
  {
    role: 'system',
    content: `Respond to the user using as little text as possible. Provide a single sentence response, and keep the language simple.`,
  };

type Messages = (
  | OpenAI.ChatCompletionAssistantMessageParam
  | OpenAI.ChatCompletionSystemMessageParam
  | OpenAI.ChatCompletionUserMessageParam
  | OpenAI.ChatCompletionMessage
)[];

function App() {
  const webcamRef = useRef<Webcam>(null);
  const captureRef = useRef<NodeJS.Timeout | undefined>();
  const [oaiKey, setOaiKey] = useState<string | undefined>(
    localStorage.getItem('openai-key') || undefined,
  );
  const [chatHistory, setChatHistory] = useState<Messages>([]);
  const [last10SecondsInFrames, setLast10SecondsInFrames] = useState<string[]>(
    [],
  );
  const [textInput, setTextInput] = useState<string>('');

  useEffect(() => {
    beginCaptures();
  }, []);

  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();

  if (!browserSupportsSpeechRecognition) {
    alert(
      "Your browser doesn't support speech recognition. Please try another browser.",
    );
  }

  useEffect(() => {
    setTextInput(transcript);
  }, [transcript]);

  const capture = () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setLast10SecondsInFrames(prevImages => {
        if (prevImages.length >= 20) {
          //keeping only last 10 seconds
          return [...prevImages.slice(1), imageSrc];
        }

        return [...prevImages, imageSrc];
      });
    }
  };

  const beginCaptures = () => {
    captureRef.current = setInterval(() => {
      capture();
    }, 500);
  };

  const stopCaptures = () => {
    clearInterval(captureRef.current);
  };

  const sendImagesToServer = async () => {
    try {
      const openai = new OpenAI({
        apiKey: oaiKey,
        dangerouslyAllowBrowser: true,
      });

      const last20FramesInArray: OpenAI.ChatCompletionContentPart[] =
        last10SecondsInFrames.map(image => ({
          type: 'image_url',
          image_url: {
            url: image,
            detail: 'low',
          },
        }));

      let messages: Messages = [];

      // messages is passed into the oai request as context
      // Provide an initial prompt for the first oai request, otherwise provide the chat history as context
      if (chatHistory.length < 1) {
        messages = [OAI_INITIAL_SYSTEM_PROMPT];
      } else {
        messages = [...chatHistory];
      }

      // Add a prompt for the user's request for each oai request
      // Construct the user text input and image frames for oai
      messages = [
        ...messages,
        OAI_USER_REQUEST_SYSTEM_PROMPT,
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: textInput,
            },
            ...last20FramesInArray,
          ],
        },
      ];

      const response = await openai.chat.completions.create({
        model: 'gpt-4-vision-preview',
        max_tokens: 100,
        messages: messages,
      });

      textToSpeech(response.choices[0].message.content!);

      console.log(chatHistory);

      const systemPrompt: OpenAI.ChatCompletionSystemMessageParam =
        chatHistory.length < 1
          ? OAI_INITIAL_SYSTEM_PROMPT
          : OAI_USER_REQUEST_SYSTEM_PROMPT;

      // First add the chat history, then for the latest response add the following:
      // - system prompt: similar to above, it's the primary prompt for the first oai request, otherwise the secondary prompt
      // - text input: the user's question
      // - last 20 frames: the frames context for the video stream
      // - response: the response from the oai request
      setChatHistory(prevChatHistory => [
        ...prevChatHistory,
        systemPrompt,
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: textInput,
            },
            // ...last20FramesInArray,
            last20FramesInArray[last10SecondsInFrames.length - 1],
          ],
        } as OpenAI.ChatCompletionUserMessageParam,
        response.choices[0].message!,
      ]);

      console.log(response);
    } catch (error) {
      console.error('Error sending images to server:', error);
    }
  };

  const textToSpeech = async (inputText: string) => {
    try {
      const openai = new OpenAI({
        apiKey: oaiKey,
        dangerouslyAllowBrowser: true,
      });

      const responseAudioFile = await openai.audio.speech.create({
        model: 'tts-1',
        input: inputText,
        voice: 'echo',
      });

      const arrayBuffer = await responseAudioFile.arrayBuffer();

      //convert array buffer to blob
      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
      const url = window.URL.createObjectURL(blob);
      const audio = new Audio();
      audio.src = url;
      audio.play();
    } catch (e) {
      console.log(e);
    }
  };

  //use effect to ask for openai key
  useEffect(() => {
    if (!oaiKey) {
      const key = prompt('Please enter your OpenAI key');
      if (key) {
        setOaiKey(key);
        localStorage.setItem('openai-key', key);
      }
    }
  }, []);

  function constructMessages(messages: Messages) {
    return messages.map(message => {
      switch (message.role) {
        case 'system':
          return (
            <div>
              <span className="font-bold">{`system: `}</span>
              {message.content}
            </div>
          );
        case 'assistant':
          return (
            <div>
              <span className="font-bold">{`assistant: `}</span>
              {message.content}
            </div>
          );
        case 'user':
          if (typeof message.content === 'string') {
            return <div>{message.content}</div>;
          } else {
            const content = (
              message.content as OpenAI.ChatCompletionContentPart[]
            ).map(item => {
              if (item.type === 'text') {
                return (
                  <div>
                    <span className="font-bold">{`user: `}</span>
                    {item.text}
                  </div>
                );
              }
              return <img width={200} src={item.image_url.url} alt="image" />;
            });

            return <div>{content}</div>;
          }
      }
    });
  }

  return (
    <div className="container mx-auto px-4">
      {/* Titles */}
      <div className="text-center mt-12">
        <h1 className="text-xl font-semibold">LiveGPT</h1>
        <h3 className="text-md text-slate-700	">ChatGPT with eyes and ears</h3>
      </div>
      {/* Video feed */}
      <div className="mt-8 flex flex-col items-center">
        <Webcam
          style={{ borderRadius: 16 }}
          ref={webcamRef}
          mirrored={false}
          videoConstraints={{
            facingMode: 'user',
            // aspectRatio: 0.5625,
          }}
        />
        {/* Toggle audio */}
        <div className="mt-4">
          {listening ? (
            <button
              type="button"
              className="focus:outline-none text-white bg-yellow-400 hover:bg-yellow-500 focus:ring-4 focus:ring-yellow-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:focus:ring-yellow-900"
              onClick={() => {
                SpeechRecognition.stopListening();
                sendImagesToServer();
              }}
            >
              Stop recording
            </button>
          ) : (
            <button
              type="button"
              className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800"
              onClick={() => {
                SpeechRecognition.startListening({ continuous: true });
              }}
            >
              Record audio
            </button>
          )}
          <p>{transcript}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="m-12 text-center">
      <div className="flex flex-row">
        <div className="basis-6/12">
          <div className="flex flex-col items-center">
            <h1 className="text-3xl font-bold">Stream</h1>
            <Webcam height={600} width={600} ref={webcamRef} mirrored={false} />
            <div className="mt-4">
              <button onClick={capture} className="mr-10">
                Snap a single photo
              </button>
              <button
                onClick={beginCaptures}
                className="border-orange-500 mr-10"
              >
                Start
              </button>
              <button onClick={stopCaptures} className="mr-10">
                Stop
              </button>
              <button onClick={sendImagesToServer} className="mr-10">
                Send images to server
              </button>
              <button
                onClick={() => setLast10SecondsInFrames([])}
                className="mr-10"
              >
                Clear
              </button>
              <button onClick={() => setChatHistory([])}>
                Clear chat history
              </button>
            </div>
          </div>
          <div className="mt-8">
            <p>Microphone: {listening ? 'on' : 'off'}</p>
            <button
              className="mr-4"
              onClick={() =>
                SpeechRecognition.startListening({ continuous: true })
              }
            >
              Start
            </button>
            <button
              className="mr-4"
              onClick={() => {
                SpeechRecognition.stopListening();
                sendImagesToServer();
              }}
            >
              Stop
            </button>
            <button onClick={resetTranscript}>Reset</button>
            <p>{transcript}</p>
          </div>
          <div className="my-4  border-solid border-2 border-indigo-600 ">
            <textarea
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder="Enter your request"
            ></textarea>
          </div>
          <div className="mt-12">
            <h1 className="text-3xl font-bold">Captured photos</h1>
            {last10SecondsInFrames.length}
            <div className="flex flex-wrap">
              {last10SecondsInFrames.map((image, index) => (
                <div key={index} className="m-2">
                  <img width={100} src={image} alt="photo taken" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="basis-6/12">
          <h1 className="text-3xl">Chat history</h1>
          {constructMessages(chatHistory)}
        </div>
      </div>
    </div>
  );
}

export default App;
