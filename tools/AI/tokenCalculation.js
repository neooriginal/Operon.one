function calculateTokens(text){
    if (!text) return 0;
    
    // Very basic token calculation - most modern tokenizers use approximately 
    // 1 token per 4 characters for English text, with variation
    const characters = text.length;
    const words = text.split(/\s+/).filter(word => word.length > 0).length;
    
    // Count code blocks which typically have higher token counts
    const codeBlockCount = (text.match(/```/g) || []).length / 2;
    
    // Approximate token calculation
    // This is still an approximation, but better than the previous version
    let tokenEstimate = Math.ceil(characters / 4);
    
    // Add extra tokens for code blocks which are typically more token-dense
    tokenEstimate += codeBlockCount * 20;
    
    // Add a safety margin
    return Math.ceil(tokenEstimate * 1.1);
}

module.exports = {calculateTokens};