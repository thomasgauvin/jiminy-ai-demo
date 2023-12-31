# Jiminy AI demo 

Inspired by [Gemini's Hands-on demo](https://www.youtube.com/watch?v=UIZAiXYceBI), we created a hands-on demo multi-modal interaction with OpenAI's GPT4 model.

Try it out (bring your own OpenAI key): [https://jiminy-ai.appsinprogress.com/](https://jiminy-ai.appsinprogress.com/)

## How it works:
* Uses GPT4's multimodal capabilties for the hands-on demo 
* Uses browser's Web Speech API for voice input
* Passes video frames as images and transcribed input to GPT4
* OpenAI text-to-speech API to read aloud the response

## Demo:

https://github.com/thomasgauvin/jiminy-ai-demo/assets/35609369/7bcbc005-bb77-4dcf-b4f2-308efe95cde8

In the above demo, we demonstrate:
1. Yellow duck walking up a road and needing to decide which path to take at an intersection.
2. Identifying the "fun" rollercoaster.
3. Recognizing and correcting a drawing of planets.
4. Recognizing a video clip from the 2008 Olympics, and correctly identifying the winning athlete & time to finish.

(Full resolution on [YouTube](https://www.youtube.com/watch?v=gm2a7KFzJW8))


## Key learnings:
* GPT4 can handle video input as video frames and recognize the progression of the sequence
* Some prompting was required to ensure that GPT4 understood what we were asking of it. For example, by asking it which toy figurines were friends/foes of the yellow duck, it understood to use this information to infer which path it should take.
* Assuming Gemini did not require behind the scene prompting, it seems like it was able to provide more context and infer the request better than GPT4.
* GPT4 has some guard rails preventing the identification of people (even if celebrities), so it uses the additional queues of text infographics to understand who wins in the Olympics clip.

Built by [@mattfrances](https://github.com/mattfrances) and [@thomasgauvin](https://github.com/thomasgauvin) 
