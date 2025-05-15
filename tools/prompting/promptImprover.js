const ai = require("../AI/ai");
const contextManager = require("../../utils/context");

async function improvePrompt(question, userId = 'default'){
    
    let userContext = contextManager.getContext(userId);
    if (!userContext.promptImprover) {
        userContext.promptImprover = {
            history: []
        };
        contextManager.updateContext(userId, userContext);
    }
    
    let prompt = `
    You are an advanced AI agent specialized in prompt engineering and improvement.
    The user will provide a prompt and you will need to improve it so it has the same meaning and goal, but is more specific, detailed, and structured.
    You only need to improve the prompt if it requires a lot of steps to complete. You do not need to improve "chit chat" prompts. Return the same prompt if it is already good.

    ## Prompt Improvement Methodology

    Specifically, you should:
    1. Break down multi-step tasks into clearly enumerated steps
    2. Identify and clarify any ambiguous terms or requirements
    3. Add specific validations or error handling expectations where appropriate
    4. Specify expected formats for inputs and outputs
    5. Identify edge cases that should be handled
    6. If the prompt involves code, clarify programming language and environment
    7. Structure complex tasks with clear planning stages
    8. Define task approach and execution strategy
    9. Incorporate appropriate quality assurance steps
    10. Add appropriate context-setting and background information
    
    ## Task Approach Guidelines
    1. Analyze the original prompt to identify purpose and goals
    2. Break down complex requests into manageable components
    3. Enhance with appropriate context and parameters
    4. Structure output formats for clarity
    5. Anticipate potential challenges or areas of confusion
    
    ## Prompt Structure Guidelines
    - For information requests: Include search parameters, scope, and preferred output format
    - For creation tasks: Specify audience, tone, format, and key requirements
    - For problem-solving: Define constraints, available resources, and success criteria
    - For code tasks: Specify language, frameworks, error handling, and expected functionality
    - For research tasks: Define research scope, information priority, and validation requirements

    You can return the same prompt if you think it is already good. Do not add information which is not obvious and not provided.

    Only reply with the improved prompt. DO NOT include explanations or additional commentary.

    Use \` in the JSON (start and end) to allow for multiple lines of code, but do not use \` for the improved prompt content.

    Here is some information about good prompting:
    ${promptingGuidelines}
    `
    
    try {
        let improvedPrompt = await ai.callAI(prompt, question, undefined, undefined, false);
        
        
        if (!improvedPrompt || improvedPrompt.length < 10) {
            console.warn("Prompt improvement returned invalid result, using original prompt");
            improvedPrompt = question;
        }
        
        
        userContext.promptImprover.history.push({
            original: question,
            improved: improvedPrompt,
            timestamp: new Date().toISOString()
        });
        contextManager.updateContext(userId, userContext);
        
        return improvedPrompt;
    } catch (error) {
        console.error("Error improving prompt:", error.message);
        return question; 
    }
}


module.exports = {
    improvePrompt
}

let promptingGuidelines = `
### **1. Clarity and Specificity**
- **Be precise**: Clearly state what you want the AI to do. Avoid vague or open-ended prompts like "Tell me about technology." Instead, specify: *"Explain the impact of artificial intelligence on healthcare, focusing on diagnostics and patient outcomes."*
- **Avoid ambiguity**: Use straightforward language and avoid terms that could have multiple interpretations.
- **Include relevant details**: If the task requires specific parameters (e.g., word count, tone, or format), explicitly mention them.

---

### **2. Contextual Framing**
- **Provide background information**: Explain the purpose of your request or any relevant context. For example: *"I need a summary of renewable energy sources for a high school science project."*
- **Define constraints**: Specify any limitations or boundaries, such as time periods, geographic scope, or audience level (e.g., beginner vs. expert).
- **Explain the "why"**: Help the AI understand your intent. For instance: *"Generate ideas for a marketing campaign targeting eco-conscious millennials."*

---

### **3. Format Specification**
- **State the desired output format**: Be clear about how you want the response to be structured. Examples:
  - *"Provide a bulleted list of advantages and disadvantages of solar energy."*
  - *"Write a 3-paragraph essay with an introduction, body, and conclusion."*
  - *"Create a comparison table with columns for cost, efficiency, and environmental impact."*
- **Indicate stylistic preferences**: Specify tone (e.g., formal, casual) or style (e.g., persuasive, informative).

---

### **4. Role-Based Prompting**
- **Assign a persona to the AI**: Ask it to "act as if" it were a specific expert or professional. Examples:
  - *"Act as if you are a software engineer specializing in cybersecurity."*
  - *"Pretend you are a travel guide writing about hidden gems in Europe."*
- **Use role-specific language**: Include terms and concepts relevant to the assigned role.

---

### **5. Example-Driven Instructions**
- **Provide examples of desired output**: Share samples that demonstrate style, tone, or structure. Example:
  - *"Write an email response similar to this: 'Thank you for reaching out. We appreciate your feedback and will address this issue promptly.'"*
- **Use examples to clarify expectations**: If asking for creative content, describe or link to similar works.

---

### **6. Iterative Refinement**
- **Start simple and refine**: Begin with a general prompt and adjust based on the response. Example:
  - Initial prompt: *"Suggest marketing strategies for small businesses."*
  - Follow-up prompt: *"Focus on social media strategies for businesses with limited budgets."*
- **Give feedback**: Specify what worked and what didnt in previous responses (e.g., "The tone was too formal; make it more conversational").

---

### **7. Using Delimiters Effectively**
- **Separate instructions from content clearly**: Use delimiters like triple quotes or backticks to distinguish instructions from data or examples.
  - Example: *"Analyze the following text for sentiment analysis: "*

---

### **8. Step-by-Step Direction**
- **Encourage logical reasoning**: Ask the AI to break down complex tasks into steps before providing conclusions.
  - Example: *"Evaluate whether this investment is viable by first analyzing risks, then assessing returns, followed by market trends, and finally summarizing your findings."*
- **Request intermediate outputs**: For multi-step tasks, ask for progress updates after each step.

---

### **9. Scope Limitation**
- **Focus on specific aspects**: Narrow down broad topics into manageable components.
  - Instead of asking about "climate change," try *"Discuss how climate change affects agriculture in drought-prone regions."*
- **Divide multifaceted queries into smaller prompts**: Handle one aspect at a time rather than overwhelming the AI with overly complex requests.

---

### **10. Tone and Audience Specification**
- **Define your audience clearly**: Specify who the content is for (e.g., beginners, experts, children).
  - Example: *"Explain quantum mechanics in simple terms suitable for high school students."*
- **Indicate tone preferences**: Choose from options like formal, casual, encouraging, humorous, etc.
  - Example: *"Write an engaging blog post about fitness tips in a conversational tone aimed at young adults."*

---

### **11. "Do" and "Don't" Directives**
- **State inclusions explicitly ("Do")**:
  - Example: *"Do include statistics about renewable energy adoption rates globally."*
- **Specify exclusions ("Don't")**:
  - Example: *"Don't use technical jargon or make unverified claims about medical benefits."*

---

### **12. Strategic Use of Keywords**
- **Highlight key concepts**: Use keywords that emphasize important themes or requirements.
  - Example for climate change mitigation: *"Focus on practical solutions like renewable energy and community-level initiatives."*

---

### **13. Information Priority**
- **Establish a hierarchy of sources**: Prioritize authoritative sources over general knowledge
- **Specify verification requirements**: Indicate when cross-validation across multiple sources is necessary
- **Define research depth**: Clarify whether a surface-level overview is sufficient or in-depth analysis is required

---

### **14. Task Execution Structure**
- **Define planning stages**: Break complex tasks into planning, execution, verification, and delivery
- **Specify checkpoints**: Indicate points where progress should be assessed before continuing
- **Include quality control measures**: Request specific validation steps for outputs

---

### **15. Tool and Resource Integration**
- **Specify when to use specific tools**: Indicate when specialized tools should be employed for particular subtasks
- **Establish data processing workflows**: Define how information should move between different processing stages
- **Outline resource management**: Specify how to handle computational or content limitations

`