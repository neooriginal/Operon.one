function calculateTokens(text){
    if (!text) return 0;
    
    
    
    const characters = text.length;
    const words = text.split(/\s+/).filter(word => word.length > 0).length;
    
    
    const codeBlockCount = (text.match(/```/g) || []).length / 2;
    
    
    
    let tokenEstimate = Math.ceil(characters / 4);
    
    
    tokenEstimate += codeBlockCount * 20;
    
    
    return Math.ceil(tokenEstimate * 1.1);
}

module.exports = {calculateTokens};