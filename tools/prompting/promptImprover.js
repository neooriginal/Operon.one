const ai = require("../AI/ai");
async function improvePrompt(prompt){
    let prompt = `
    You are an AI agent that can improve a prompt.
    The user will provide a prompt and you will need to improve it so it has the same meaning and goal, but is more specific and detailed.
    You can return the same prompt if you think it is already good.

    Return the improved prompt in a JSON format.
    {
        "improvedPrompt": \`IMPROVED PROMPT HERE\`
    }

    Here is some information about good prompting:
    ${promptingGuidelines}
    `
    let improvedPrompt = await ai.callAI(prompt, prompt);
    return improvedPrompt.improvedPrompt;
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
  - *"Write an email response similar to this: 'Thank you for reaching out. We appreciate your feedback and will address this issue promptly.'”*
- **Use examples to clarify expectations**: If asking for creative content, describe or link to similar works.

---

### **6. Iterative Refinement**
- **Start simple and refine**: Begin with a general prompt and adjust based on the response. Example:
  - Initial prompt: *"Suggest marketing strategies for small businesses."*
  - Follow-up prompt: *"Focus on social media strategies for businesses with limited budgets."*
- **Give feedback**: Specify what worked and what didn’t in previous responses (e.g., "The tone was too formal; make it more conversational").

---

### **7. Using Delimiters Effectively**
- **Separate instructions from content clearly**: Use delimiters like triple quotes or backticks to distinguish instructions from data or examples.
  - Example: *"Analyze the following text for sentiment analysis: ``````”*

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
  - Example for climate change mitigation: *“Focus on practical solutions like renewable energy and community-level initiatives.”*

`