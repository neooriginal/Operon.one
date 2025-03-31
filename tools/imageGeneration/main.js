const ai = require("../AI/ai");

async function runTask(task, otherAiData, callback){
    let summary = await ai.generateImage(task+"\n\n"+otherAiData);
    callback(summary);
}

module.exports = {runTask};