const ai = require("../AI/ai");
let history = [];
async function write(question, information){
    let prompt = `
    You are an AI writer that can write about a given topic based on the information provided.

    Information: ${information}
    `
    const output = await ai.callAI(prompt, question, history);
    history.push({role: "user", content: [
        {type: "text", text: question}
    ]});
    history.push({role: "assistant", content: [
        {type: "text", text: output}
    ]});
    return output;
}

module.exports = {
    write
}
