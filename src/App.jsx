import { useEffect, useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import './App.css';
import OpenAI from 'openai';
import 'regenerator-runtime/runtime';
import SpeechRecognition, {
  useSpeechRecognition, //@ts-ignore
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

const OAI_USER_REQUEST_SYSTEM_PROMPT =
  {
    role: 'system',
    content: `Respond to the user using as little text as possible. Provide a single sentence response, and keep the language simple.`,
  };

function App() {
  const webcamRef = useRef(null);
  const captureRef = useRef();
  const [oaiKey, setOaiKey] = useState(
    localStorage.getItem('openai-key') || undefined,
  );
  const [chatHistory, setChatHistory] = useState([]);
  const [last10SecondsInFrames, setLast10SecondsInFrames] = useState(
    [],
  );



  const [textInput, setTextInput] = useState('');
  const chatHistoryHtmlContainerRef = useRef(null);
  const [deviceId, setDeviceId] = useState({});
  const [devices, setDevices] = useState([]);
  
  useEffect(() => {
    beginCaptures();
  }, []);


  const handleDevices = useCallback(
    mediaDevices =>
      setDevices(mediaDevices.filter(({ kind }) => kind === "videoinput")),
    [setDevices]
  );

  useEffect(
    () => {
      navigator.mediaDevices.enumerateDevices().then(handleDevices);
    },
    [handleDevices]
  );

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

  // const stopCaptures = () => {
  //   clearInterval(captureRef.current);
  // };

  const sendImagesToServer = async () => {
    try {
      const openai = new OpenAI({
        apiKey: oaiKey,
        dangerouslyAllowBrowser: true,
      });

      const last20FramesInArray =
        last10SecondsInFrames.map(image => ({
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
            // ...last20FramesInArray,
            last20FramesInArray[last10SecondsInFrames.length - 1],
          ],
        },
      ]);

      const response = await openai.chat.completions.create({
        model: 'gpt-4-vision-preview',
        max_tokens: 100,
        messages: messages,
      });

      textToSpeech(response.choices[0].message.content);

      console.log(chatHistory);

      // First add the chat history, then for the latest response add the following:
      // - system prompt: similar to above, it's the primary prompt for the first oai request, otherwise the secondary prompt
      // - text input: the user's question
      // - last 20 frames: the frames context for the video stream
      // - response: the response from the oai request

      setChatHistory(prevChatHistory => [
        ...prevChatHistory,
        response.choices[0].message,
      ]);

      console.log(response);
    } catch (error) {
      console.error('Error sending images to server:', error);
      alert("Your OpenAI key is invalid. Please enter a valid key.");
      setOaiKey(undefined);
      localStorage.removeItem('openai-key');
    }
  };

  const textToSpeech = async (inputText) => {
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

  useEffect(() => {
    // Scroll to the bottom of the messages container
    if (chatHistoryHtmlContainerRef.current) {
      chatHistoryHtmlContainerRef.current.scrollTop = chatHistoryHtmlContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

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


  function constructMessages(messages) {
    return messages.map(message => {
      switch (message.role) {
        case 'system':
          return (<></>);
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
          return (<div className="mb-2">
                    <div className="bg-slate-100 p-3 rounded-lg flex flex-row align-middle items-start justify-start">
                      <div className="font-bold text-blue-500 mr-2">{`User: `}</div>
                      {
                        message && message.content && typeof message.content === 'string' &&
                        <div className="flex-grow text-gray-800">{message.content}</div>
                      }
                      {
                        message && message.content && typeof message.content != 'string' &&
                         message.content.map(item => {
                          if (item.type === 'text') {
                            return (<div className="flex-grow text-gray-800">{item.text}</div>);
                          }
                          else{
                            return (<div className='flex-shrink-0 rounded-md'>
                                  <div className="relative">
                                    <img width={50} src={item.image_url.url} alt="video thumbnail" className="rounded" />
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
                              {/* <img className='rounded-md' width={50} src={item.image_url.url} alt="image" /> */}
                            </div>);
                          }
                         })
                      }
                    </div>
                  </div>);
      }
    });

  }

  return (
    <div className="h-screen w-screen flex flex-col">
      {/* Titles */}
      <div className="bg-gray-800 text-white p-4 flex flex-col justify-center align-middle">
        <div className='h-fit'>
          <h1 className="text-3xl font-semibold">Jiminy AI</h1>
          <h3 className="text-md text-slate-200	">AI with eyes and ears</h3>
        </div>

      </div>
      {/* Video feed */}
      <div className="flex-1 flex flex-col lg:flex-row">
        <div id="webcam" className='lg:w-1/2 bg-gray-200 p-4 flex flex-col items-center justify-center'>
            <Webcam
              style={{ borderRadius: 16 }}
              className='max-h-72 lg:max-h-full'
              ref={webcamRef}
              mirrored={false}
              videoConstraints={{
                deviceId: deviceId
              }}
            />
            <button
              type="button"
              className="mt-2 text-white bg-slate-700 hover:bg-slate-800 focus:ring-4 focus:ring-slate-300 font-medium rounded-lg text-sm px-5 py-2.5 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800"
              onClick={() => {
                //onclick set the device to the next camera
                const index = devices.findIndex(d => d.deviceId === deviceId);
                const nextIndex = index + 1;
                const nextDevice = devices[nextIndex % devices.length];
                setDeviceId(nextDevice);
              }}
            >
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-switch-camera"><path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/><path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5"/><circle cx="12" cy="12" r="3"/><path d="m18 22-3-3 3-3"/><path d="m6 2 3 3-3 3"/></svg>

            </button>

        </div>
        <div id="chat" className='lg:w-1/2 bg-gray-300 h-full relative'>
          {/* Toggle audio */}
              {/* List of messages */}
              <div 
                ref={chatHistoryHtmlContainerRef}
                className='max-h-[calc(100svh-30rem)] lg:max-h-[calc(100svh-10rem)] overflow-y-auto p-3'>
                {constructMessages(chatHistory)}

              </div>

              {/* Sticky input div at the bottom */}

          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white flex justify-center">
                {listening ? (
                  <button
                    type="button"
                    className="focus:outline-none text-white bg-yellow-400 hover:bg-yellow-500 focus:ring-4 focus:ring-yellow-300 font-medium rounded-lg text-sm px-5 py-2.5 dark:focus:ring-yellow-900"
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
                    className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800"
                    onClick={() => {
                      resetTranscript();
                      SpeechRecognition.startListening({ continuous: true });
                    }}
                  >
                    Record
                  </button>
                )}
              </div>
        </div>
      </div>
    </div>
  );

  // return (
  //   <div className="m-12 text-center">
  //     <div className="flex flex-row">
  //       <div className="basis-6/12">
  //         <div className="flex flex-col items-center">
  //           <h1 className="text-3xl font-bold">Stream</h1>
  //           <Webcam height={600} width={600} ref={webcamRef} mirrored={false} />
  //           <div className="mt-4">
  //             <button onClick={capture} className="mr-10">
  //               Snap a single photo
  //             </button>
  //             <button
  //               onClick={beginCaptures}
  //               className="border-orange-500 mr-10"
  //             >
  //               Start
  //             </button>
  //             <button onClick={stopCaptures} className="mr-10">
  //               Stop
  //             </button>
  //             <button onClick={sendImagesToServer} className="mr-10">
  //               Send images to server
  //             </button>
  //             <button
  //               onClick={() => setLast10SecondsInFrames([])}
  //               className="mr-10"
  //             >
  //               Clear
  //             </button>
  //             <button onClick={() => setChatHistory([])}>
  //               Clear chat history
  //             </button>
  //           </div>
  //         </div>
  //         <div className="mt-8">
  //           <p>Microphone: {listening ? 'on' : 'off'}</p>
  //           <button
  //             className="mr-4"
  //             onClick={() =>
  //               SpeechRecognition.startListening({ continuous: true })
  //             }
  //           >
  //             Start
  //           </button>
  //           <button
  //             className="mr-4"
  //             onClick={() => {
  //               SpeechRecognition.stopListening();
  //               // sendImagesToServer();
  //             }}
  //           >
  //             Stop
  //           </button>
  //           <button onClick={resetTranscript}>Reset</button>
  //           <p>{transcript}</p>
  //         </div>
  //         <div className="my-4  border-solid border-2 border-indigo-600 ">
  //           <textarea
  //             value={textInput}
  //             onChange={e => setTextInput(e.target.value)}
  //             placeholder="Enter your request"
  //           ></textarea>
  //         </div>
  //         <div className="mt-12">
  //           <h1 className="text-3xl font-bold">Captured photos</h1>
  //           {last10SecondsInFrames.length}
  //           <div className="flex flex-wrap">
  //             {last10SecondsInFrames.map((image, index) => (
  //               <div key={index} className="m-2">
  //                 <img width={100} src={image} alt="photo taken" />
  //               </div>
  //             ))}
  //           </div>
  //         </div>
  //       </div>
  //       <div className="basis-6/12">
  //         <h1 className="text-3xl">Chat history</h1>
  //         {constructMessages(chatHistory)}
  //       </div>
  //     </div>
  //   </div>
  // );
}

export default App;

