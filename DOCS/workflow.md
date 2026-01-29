# New Project (Browser Extenstion)

- Discuss the architecture with chatgpt, grok 
    
    - Prepare a detailed description of what do you have in mind 

        Browser Extenstion for remote control of browser by agents 

        Background:

        As we know a browser extenstion is made up of three components 
        
        - Background scripts That lets your extenstion interact outside the browser 
        - Content scripts Just interacts with the webpage
        - Mainfest defines the contract between the extenstion and browser 


        Outside Browser <---> Background script <---> Content Script <---> Inside Browser

        Architecture:

        Agent <---> Background Script <----> Content Script <----> Web Page 

        Background will communicate with the Agent through websockets/http/tcp whichever is best
        Background will call the content script to interact with the webpage 
        
        Content Script will define methods to interact with the webpage 
        The main ones are the following for now 

            - snapshot 
            - click 
            - fill 

        The most important method of all is snapshot we need to discuss a lot of decisions about it to make it the most contenxt friendly and reliable 

- Create architecture.md 

`This document defines the high-level architecture for an LLM-controlled browser extension designed for real-time agent interaction with web applications. The purpose of this document is to establish system boundaries, responsibilities, and input/output contracts while intentionally deferring implementation details for later, more robust iterations.` 

- Implement high level components and functions with todos and the import exports between files
  
- Implement the todos with claude haiku v3

- Review and Fix with claude Opus

- Create Unit Tests

- Create E2E Tests 

- Run them and let claude opus review and fix
