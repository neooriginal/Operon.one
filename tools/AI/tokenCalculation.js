
function calculateTokens(text){
    let words = text.split(" ").length;
    let characters = text.length;
    return ((words*1.5) * (characters*0.2))
}

module.exports = {calculateTokens};