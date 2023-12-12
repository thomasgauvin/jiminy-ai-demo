import { useEffect, useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import './App.css';
import OpenAI from 'openai';
import 'regenerator-runtime/runtime';
import SpeechRecognition, {
  useSpeechRecognition,
} from 'react-speech-recognition';

const OAI_INITIAL_SYSTEM_PROMPT = {
  role: 'system',
  content: `You are a friendly companion. 
    Your objective is to be helpful and assist. 
    These are frames of a video. 
    Do not refer to frames as independent images. 
    Respond to the user request. 
    Answer in a single sentence as simple as possible. 
    Keep the language simple. Explain your answer.
    If it is a drawing, do not comment on the surface, only the drawing.`,
};

const OAI_USER_REQUEST_SYSTEM_PROMPT = {
  role: 'system',
  content: `Respond to the user using as little text as possible. Provide a single sentence response, and keep the language simple, but explain your answer.`,
};

function App() {
  const webcamRef = useRef(null);
  const captureRef = useRef();
  const chatHistoryHtmlContainerRef = useRef(null);
  const [oaiKey, setOaiKey] = useState(
    localStorage.getItem('openai-key') || undefined,
  );
  const [chatHistory, setChatHistory] = useState([]);
  const [videoFrames, setVideoFrames] = useState([]);
  const [textInput, setTextInput] = useState('');
  const [deviceId, setDeviceId] = useState({});
  const [devices, setDevices] = useState([]);
  const [loadingOAIResponse, setLoadingOAIResponse] = useState(false);
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();

  useEffect(() => {
    if (!oaiKey) {
      const key = prompt('Please enter your OpenAI key');
      if (key) {
        setOaiKey(key);
        localStorage.setItem('openai-key', key);
      }
    }
  }, []);

  const handleDevices = useCallback(
    mediaDevices =>
      setDevices(mediaDevices.filter(({ kind }) => kind === 'videoinput')),
    [setDevices],
  );

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(handleDevices);
  }, [handleDevices]);

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
      setVideoFrames(prevImages => {

        //max of 20 frames, 10 seconds (frames are captured every 500ms)
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
      setLoadingOAIResponse(true);
      const openai = new OpenAI({
        apiKey: oaiKey,
        dangerouslyAllowBrowser: true,
      });

      const last20FramesInArray = videoFrames.map(image => ({
        type: 'image_url',
        image_url: {
          url: image,
          detail: 'low',
        },
      }));

      let messages = [];

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

      const systemPrompt =
        chatHistory.length < 1
          ? OAI_INITIAL_SYSTEM_PROMPT
          : OAI_USER_REQUEST_SYSTEM_PROMPT;

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
            last20FramesInArray[videoFrames.length - 1], //don't pass all images in chat history to avoid unnecessary openai usage
          ],
        },
      ]);

      const response = await openai.chat.completions.create({
        model: 'gpt-4-vision-preview',
        max_tokens: 100,
        messages: messages,
      });

      textToSpeech(response.choices[0].message.content);

      setChatHistory(prevChatHistory => [
        ...prevChatHistory,
        response.choices[0].message,
      ]);
      setLoadingOAIResponse(false);
    } catch (error) {
      setLoadingOAIResponse(false);
      console.error('Error sending images to server:', error);
      alert('Your OpenAI key is invalid. Please enter a valid key.');
      setOaiKey(undefined);
      localStorage.removeItem('openai-key');
    }
  };

  const textToSpeech = async inputText => {
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

      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
      const url = window.URL.createObjectURL(blob);
      const audio = new Audio();
      audio.src = url;
      audio.play();
    } catch (e) {
      console.log(e);
    }
  };

  useEffect(() => {
    // Scroll to the bottom of the messages container
    if (chatHistoryHtmlContainerRef.current) {
      chatHistoryHtmlContainerRef.current.scrollTop =
        chatHistoryHtmlContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  function clearCaptures(){
    setVideoFrames([]);
  }

  function constructMessages(messages) {
    return messages.map(message => {
      switch (message.role) {
        case 'system':
          return <></>;
        case 'assistant':
          return (
            <div className="mb-2">
              <div className="bg-slate-100 p-3 rounded-lg">
                <span className="font-bold text-blue-950">{`Assistant: `}</span>
                <span className="text-gray-800">{message.content}</span>
              </div>
            </div>
          );
        case 'user':
          return (
            <div className="mb-2">
              <div className="bg-slate-100 p-3 rounded-lg flex flex-row align-middle items-start justify-start">
                <div className="font-bold text-blue-500 mr-2">{`User: `}</div>
                {message &&
                  message.content &&
                  typeof message.content === 'string' && (
                    <div className="flex-grow text-gray-800">
                      {message.content}
                    </div>
                  )}
                {message &&
                  message.content &&
                  typeof message.content != 'string' &&
                  message.content.map(item => {
                    if (item.type === 'text') {
                      return (
                        <div className="flex-grow text-gray-800">
                          {item.text}
                        </div>
                      );
                    } else {
                      return (
                        <div className="flex-shrink-0 rounded-md">
                          <div className="relative">
                            <img
                              width={50}
                              src={item.image_url.url}
                              alt="video thumbnail"
                              className="rounded"
                            />
                            <div className="absolute inset-3 flex items-center justify-center">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                className="w-12 h-12 text-white opacity-75 hover:opacity-100 transition-opacity"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M5 3l14 9-14 9V3z"
                                />
                              </svg>
                            </div>
                          </div>
                        </div>
                      );
                    }
                  })}
              </div>
            </div>
          );
      }
    });
  }

  return (
    <div className="h-[calc(100dvh)] w-screen flex flex-col">
      {/* Titles */}
      <div className="bg-gray-800 text-white p-4 flex flex-col justify-center align-middle">
        <div className="h-fit">
          <h1 className="text-3xl font-semibold">Jiminy AI</h1>
          <h3 className="text-md text-slate-200	">AI with eyes and ears</h3>
        </div>
      </div>
      {/* Video feed */}
      <div className="flex-1 flex flex-col lg:flex-row">
        <div
          id="webcam"
          className="bg-gray-200 p-4 flex flex-col items-center justify-center"
        >
          <Webcam
            style={{ borderRadius: 16 }}
            className="max-h-60 lg:max-h-full"
            ref={webcamRef}
            mirrored={false}
            videoConstraints={{
              deviceId: deviceId,
            }}
          />
          {devices.length <= 2 ? (
            <button
              type="button"
              className="mt-2 text-white bg-slate-700 hover:bg-slate-800 focus:ring-4 focus:ring-slate-300 font-medium rounded-lg text-sm px-5 py-2.5 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800"
              onClick={() => {
                //onclick set the device to the next camera
                const index = devices.findIndex(d => d.deviceId === deviceId);
                const nextIndex = index + 1;
                const nextDevice = devices[nextIndex % devices.length];
                setDeviceId(nextDevice.deviceId);
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-switch-camera"
              >
                <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
                <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
                <circle cx="12" cy="12" r="3" />
                <path d="m18 22-3-3 3-3" />
                <path d="m6 2 3 3-3 3" />
              </svg>
            </button>
          ) : (
            <select
              value={deviceId}
              onChange={e => setDeviceId(e.target.value)}
              className="mt-2 text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800"
            >
              {devices.map(device => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex flex-col flex-1">
          <div id="chat" className="bg-gray-300 h-full relative">
            {/* List of messages */}
            <div
              ref={chatHistoryHtmlContainerRef}
              className="max-h-[calc(100svh-30rem)] lg:max-h-[calc(100svh-10rem)] overflow-y-auto p-3"
            >
              {constructMessages(chatHistory)}
              {loadingOAIResponse ? (
                <div className="text-center m-4">
                  <div role="status">
                    <svg
                      aria-hidden="true"
                      className="inline w-10 h-10 text-gray-200 animate-spin fill-blue-700"
                      viewBox="0 0 100 101"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                        fill="currentColor"
                      />
                      <path
                        d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                        fill="currentFill"
                      />
                    </svg>
                    <span className="sr-only">Loading...</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          {/* Sticky input div at the bottom to toggle audio */}
          <div className="sticky bottom-0 left-0 right-0 p-4 bg-white flex justify-center">
            {listening ? (
              <button
                type="button"
                className="focus:outline-none text-white bg-yellow-400 hover:bg-yellow-500 focus:ring-4 focus:ring-yellow-300 font-medium rounded-lg text-sm px-5 py-2.5 dark:focus:ring-yellow-900"
                onClick={async () => {
                  SpeechRecognition.stopListening();
                  stopCaptures();
                  await sendImagesToServer();
                  clearCaptures();
                }}
              >
                Stop recording
              </button>
            ) : (
              <button
                type="button"
                className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800 disabled:bg-opacity-50 disabled:hover:bg-opacity-50"
                onClick={() => {
                  resetTranscript();
                  SpeechRecognition.startListening({ continuous: true });
                  beginCaptures();
                }}
                disabled={loadingOAIResponse}
              >
                Record
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
