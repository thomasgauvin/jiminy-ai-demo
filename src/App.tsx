import { useState } from 'react';
import Webcam from 'react-webcam';
import './App.css';
import { useRef } from 'react';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: '', // defaults to process.env["OPENAI_API_KEY"]
  dangerouslyAllowBrowser: true,
});

function App() {
  const webcamRef = useRef<Webcam>(null);
  const [images, setImages] = useState<string[]>([]);
  const captureRef = useRef<number | undefined>();

  const capture = () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setImages(prevImages => [...prevImages, imageSrc]);
    }
  };

  const beginCaptures = () => {
    captureRef.current = setInterval(() => {
      capture();
    }, 1000);
  };

  const stopCaptures = () => {
    clearInterval(captureRef.current);
  };

  const sendImagesToServer = async () => {
    try {
      if (images.length > 3) {
        return;
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-4-vision-preview',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'These are frames of a video. Explain what is happening. Answer in a single sentence as simple as possible. Keep the language simple. If it is a drawing, do not comment on the surface, only the drawing.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: images[0],
                  detail: 'low',
                },
              },
              {
                type: 'image_url',
                image_url: {
                  url: images[1],
                  detail: 'low',
                },
              },
              {
                type: 'image_url',
                image_url: {
                  url: images[2],
                  detail: 'low',
                },
              },
            ],
          },
        ],
      });

      console.log(response);
    } catch (error) {
      console.error('Error sending images to server:', error);
    }
  };

  return (
    <>
      <div className="flex flex-col items-center">
        <h1 className="text-3xl font-bold">Stream</h1>
        <Webcam height={600} width={600} ref={webcamRef} mirrored={true} />
        <div className="mt-4">
          <button onClick={capture} className="mr-10">
            Snap a single photo
          </button>
          <button onClick={beginCaptures} className="border-orange-500 mr-10">
            Start
          </button>
          <button onClick={stopCaptures} className="mr-10">
            Stop
          </button>
          <button onClick={sendImagesToServer} className="mr-10">
            Send images to server
          </button>
          <button onClick={() => setImages([])}>Clear</button>
        </div>
      </div>
      <div className="mt-12">
        <h1 className="text-3xl font-bold">Captured photos</h1>
        <div className="flex flex-wrap">
          {images.map((image, index) => (
            <div key={index} className="m-2">
              <img width={200} src={image} alt="photo taken" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default App;
