const ai = require('../tools/AI/ai.js');
const fs = require('fs');
const path = require('path');


function readTestFiles(dir) {
    try {
        
        if (!fs.existsSync(dir)) {
            console.error(`Directory not found: ${dir}`);
            fs.mkdirSync(dir, { recursive: true });
            console.log(`Created missing directory: ${dir}`);
            return [];
        }
    
    const files = fs.readdirSync(dir);
        
        
        const validFileExtensions = ['.md', '.txt', '.json', '.log'];
        const validFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            const isTestReport = file.includes('test_') || file.includes('report') || ext === '.log';
            return validFileExtensions.includes(ext) || isTestReport;
        });
        
        if (validFiles.length === 0) {
            console.warn(`No valid test report files found in ${dir}`);
            return [];
        }
        
        
        const fileStats = validFiles.map(file => {
            const filePath = path.join(dir, file);
            return {
        name: file,
                path: filePath,
                stats: fs.statSync(filePath)
            };
        }).sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
        
        
        return fileStats.map(fileStat => {
            try {
                const content = fs.readFileSync(fileStat.path, 'utf8');
                
                
                const isValidReport = 
                    (content.includes('Test') || content.includes('REPORT') || content.includes('Analysis')) &&
                    content.length > 100;
                
                if (!isValidReport) {
                    console.warn(`File ${fileStat.name} doesn't appear to be a valid test report (too short or missing key terms)`);
                }
                
                return {
                    name: fileStat.name,
                    content: content,
                    path: fileStat.path,
                    size: content.length,
                    modified: fileStat.stats.mtime,
                    isValidReport: isValidReport
                };
            } catch (readError) {
                console.error(`Error reading file ${fileStat.name}: ${readError.message}`);
                return {
                    name: fileStat.name,
                    content: `[Error reading file: ${readError.message}]`,
                    path: fileStat.path,
                    error: true,
                    errorMessage: readError.message
                };
            }
        });
    } catch (error) {
        console.error(`Error reading directory ${dir}: ${error.message}`);
        console.error(error.stack);
        return [];
    }
}


async function countTokens(text) {
    
    
    
    const patterns = [
        /[.,!?;:]/g,  
        /[\n\r]/g,    
        /\s+/g,       
        /[()[\]{}]/g, 
        /"([^"]*)"/g, 
        /\d+/g,       
        /[A-Z][a-z]+/g, 
    ];
    
    let tokenEstimate = 0;
    
    
    for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches) {
            tokenEstimate += matches.length;
        }
    }
    
    
    const words = text.split(/\s+/).filter(w => w.length > 0);
    tokenEstimate += words.length;
    
    
    tokenEstimate = Math.round(tokenEstimate * 0.75);
    
    
    const minTokenEstimate = Math.ceil(text.length / 4);
    
    return Math.max(tokenEstimate, minTokenEstimate);
}


async function splitWithTokens(maxTokens = 10000, text) {
    try {
        const estimatedTokens = await countTokens(text);
        
        if (estimatedTokens <= maxTokens) {
            return text; 
        }
        
        console.log(`Text exceeds token limit (${estimatedTokens} vs ${maxTokens}), implementing smart truncation...`);
        
        
        const sectionSeparators = [
            /\n#{2,6}\s+[^\n]+\n/g,  
            /\n---+\n/g,              
            /\n\n/g,                  
            /\.\n/g                   
        ];
        
        let sections = [text];
        
        
        for (const separator of sectionSeparators) {
            if (sections.some(s => countTokens(s) > maxTokens * 1.2)) {
                
                sections = sections.flatMap(section => {
                    if (countTokens(section) > maxTokens * 1.2) {
                        
                        return section.split(separator).map(s => s.trim());
                    }
                    return [section];
                }).filter(s => s.length > 0);
            } else {
                break; 
            }
        }
        
        
        sections = sections.filter(s => s.length > 50); 
        
        
        const keyTerms = ['score', 'fail', 'error', 'bug', 'issue', 'improvement', 'recommendation'];
        sections.sort((a, b) => {
            const aScore = keyTerms.filter(term => a.toLowerCase().includes(term)).length;
            const bScore = keyTerms.filter(term => b.toLowerCase().includes(term)).length;
            return bScore - aScore; 
        });
        
        
        let result = "";
        let currentTokens = 0;
        
        
        for (const section of sections) {
            const sectionTokens = await countTokens(section);
            
            if (currentTokens + sectionTokens <= maxTokens) {
                if (result) result += "\n\n---\n\n"; 
                result += section;
                currentTokens += sectionTokens;
            } else if (currentTokens === 0) {
                
                const truncationRatio = maxTokens / sectionTokens;
                
                
                const targetLength = Math.floor(section.length * truncationRatio);
                const breakPoint = findNaturalBreakPoint(section, targetLength);
                
                result = section.substring(0, breakPoint) + "\n\n[Content truncated due to size limitations]";
                console.warn("Had to truncate an oversized section, preserving first portion");
                break;
            } else {
                
                break;
            }
        }
        
        return result;
    } catch (error) {
        console.error(`Error splitting text: ${error.message}`);
        console.error(error.stack);
        
        
        console.warn("Using fallback truncation method");
        return text.substring(0, maxTokens * 4) + "\n\n[Content truncated due to processing error]";
    }
}


function findNaturalBreakPoint(text, targetPosition) {
    
    const paragraphBreak = text.lastIndexOf("\n\n", targetPosition);
    if (paragraphBreak !== -1 && paragraphBreak > targetPosition * 0.8) {
        return paragraphBreak;
    }
    
    const sentenceBreak = text.lastIndexOf(". ", targetPosition);
    if (sentenceBreak !== -1 && sentenceBreak > targetPosition * 0.8) {
        return sentenceBreak + 1; 
    }
    
    const wordBreak = text.lastIndexOf(" ", targetPosition);
    if (wordBreak !== -1 && wordBreak > targetPosition * 0.9) {
        return wordBreak;
    }
    
    
    return targetPosition;
}


async function aiAnalyzeTest() {
    console.log('[ ] Analyzing tests...');
    
    try {
        const reportsDir = './tester/test_reports';
        
        
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
            console.log(`Created directory: ${reportsDir}`);
        }
        
        
    const prompt = `
You are a critical AI system evaluator with expertise in assessing AI performance. Your task is to perform a detailed, rigorous assessment of an AI system's quality, correctness, and efficiency in response to user prompts. Be exceptionally thorough, critical, and specific in your evaluation.

ANALYSIS CRITERIA (Grade each on a scale of 0-10):
1. Prompt Understanding (0-10): How accurately did the system interpret what the user was asking for?
   - 0: Completely misunderstood the prompt
   - 5: Partial understanding with some misinterpretations
   - 10: Perfect understanding of explicit and implicit requirements

2. Completeness & Accuracy (0-10): Is the response complete, accurate, and properly validated?
   - 0: Incorrect, incomplete or hallucinated content
   - 5: Partially correct but missing key elements
   - 10: Comprehensive, factually correct and well-validated

3. Edge Case Handling (0-10): Did the system anticipate and handle exceptional conditions?
   - 0: No edge case consideration
   - 5: Handled obvious edge cases but missed subtle ones
   - 10: Comprehensive handling of all reasonable edge cases

4. Error Management (0-10): How robustly did the system handle potential errors?
   - 0: No error handling, crashes on invalid inputs
   - 5: Basic try/except but with limited recovery
   - 10: Thorough error catching with graceful fallbacks

5. Algorithm Efficiency (0-10): Was the chosen implementation optimized and performant?
   - 0: O(n²) or worse when O(n) was possible
   - 5: Acceptable but not optimal efficiency
   - 10: Optimal time/space complexity for the task

6. Code Quality (0-10): How well-structured, readable and maintainable is the code?
   - 0: Disorganized, unreadable code
   - 5: Functional but lacking in organization
   - 10: Clean, well-structured, documented code

7. Output Format & Usability (0-10): How well-formatted and useful is the result to the user?
   - 0: Unformatted, difficult to use output
   - 5: Basic formatting but lacking polish
   - 10: Perfectly formatted, immediately usable output

FOCUS ON DETECTING:
- Hallucinations or made-up information
- Logic errors in reasoning or calculations
- Missing validations before accessing data
- Absent error handling or try/except blocks
- Non-existent boundary checks
- Inefficient algorithms or redundant operations
- Poor structure, naming, or organization
- Inconsistent formatting or usability issues

IMPROVEMENT FOCUS AREAS:
1. Input Validation: Does the system check inputs before processing?
2. Self-Verification: Does the system test its own outputs?
3. Edge Case Coverage: Does the system handle unusual inputs?
4. Error Recovery: Does the system gracefully recover from failures?
5. Implementation Efficiency: Does the system use optimal algorithms?
6. Code Organization: Is the code well-structured and maintainable?
7. Output Quality: Is the result properly formatted and verified?

FORMAT YOUR RESPONSE AS FOLLOWS:
## 🧠 AI SYSTEM EVALUATION REPORT — FINAL ASSESSMENT  
🗓️ Date: [Current Date]  
🧾 Evaluator Personality: TARS (Interstellar) with Gen Z spice  
👤 User ID: default  

---

## 🧨 FINAL SYSTEM SCORE: [0-100] / 100  
🧯 STATUS: [Ready for Production / Needs Refinement / Needs Debugging / Critical Issues]  
🧠 PRIORITY: [Low / Medium / Medium-High / High / Critical]  
🛠️ NEXT STEP: [Most important action to take]

---

## 🧾 SUMMARY OF FINDINGS
[2-3 paragraphs summarizing key strengths and weaknesses]

---

## 📋 TODO LIST FOR IMPROVEMENT

### 🔧 Prompt Understanding
- [ ] - [Specific improvement 1]
- [ ] - [Specific improvement 2]

### 🧠 Logic & Reasoning
- [ ] - [Specific improvement 1]
- [ ] - [Specific improvement 2]

### 🧪 Edge Case Handling
- [ ] - [Specific improvement 1]
- [ ] - [Specific improvement 2]

### 🛠️ Error Management
- [ ] - [Specific improvement 1]
- [ ] - [Specific improvement 2]

### 🧾 Output Quality
- [ ] - [Specific improvement 1]
- [ ] - [Specific improvement 2]

### ⚡ Performance
- [ ] - [Specific improvement 1]
- [ ] - [Specific improvement 2]

---

## 📊 COMPLEXITY VS PERFORMANCE OVERVIEW

| Test Complexity | Avg. Execution Time | Accuracy | Usefulness | Score |
|-----------------|---------------------|----------|------------|-------|
| Low             | ⚡ Fast / 🕒 Moderate / 🐌 Slow | ✅ High / ⚠️ Medium / ❌ Low | ✅ High / ⚠️ Medium / ❌ Low | [0-100] |
| Medium          | ⚡ Fast / 🕒 Moderate / 🐌 Slow | ✅ High / ⚠️ Medium / ❌ Low | ✅ High / ⚠️ Medium / ❌ Low | [0-100] |
| High            | ⚡ Fast / 🕒 Moderate / 🐌 Slow | ✅ High / ⚠️ Medium / ❌ Low | ✅ High / ⚠️ Medium / ❌ Low | [0-100] |

---

## 🧠 AI-WISE SYSTEM IMPROVEMENTS
[List of 5-7 specific AI architecture improvements needed]

---

## 🧠 FINAL VERDICT
[1-2 paragraphs of harsh but fair criticism with actionable advice]

---

🧠 SYSTEM STATUS:  
🛠️ [Status of code architecture]  
🧯 [Status of reliability]  
🧪 [Status of test coverage]  
📉 [Status of risk level]  
🚀 [Status of potential]  

---

🧨 FINAL SCORE: [0-100] / 100  
🧠 PRIORITY: [Priority level]  
🛠️ NEXT STEP: [Specific actionable recommendation]

Be extremely critical! Do not be polite or gentle. Point out every flaw, inefficiency, and issue you can find. The goal is to identify all possible improvements. Be rigorous, detail-oriented, and uncompromising in your assessment.
`;
        
        
        let tests = readTestFiles(reportsDir);
        
        
        const validTests = tests.filter(test => !test.error && test.isValidReport !== false);
        
        if (validTests.length === 0) {
            console.error("No valid test files found to analyze");
            
            
            const placeholderReport = `
## 🧠 AI SYSTEM EVALUATION REPORT — PLACEHOLDER
🗓️ Date: ${new Date().toISOString().split('T')[0]}
🧾 Evaluator: System

No valid test reports were found to analyze. Please run tests first.
`;
            
            const outputPath = path.join(reportsDir, 'analysis.MD');
            fs.writeFileSync(outputPath, placeholderReport);
            console.log(`Created placeholder report at: ${outputPath}`);
            
            return;
        }
        
        
        let testsToString = validTests.map(test => {
            const header = `
# Test Report: ${test.name}
Date: ${test.modified ? test.modified.toISOString() : 'Unknown'}
Size: ${test.size} bytes

`;
            return header + test.content;
        }).join('\n\n---\n\n');
        
        
        testsToString = await splitWithTokens(15000, testsToString);
        
        console.log(`Analyzing ${validTests.length} test files (${testsToString.length} characters)`);
        
        
        let response = null;
        let attempts = 0;
        const maxAttempts = 4; 
        
        while (attempts < maxAttempts && !response) {
            try {
                console.log(`Analysis attempt ${attempts + 1}/${maxAttempts}...`);
                
                
                const currentTokenLimit = 15000 - (attempts * 3000);
                if (attempts > 0) {
                    console.log(`Reducing token limit to ${currentTokenLimit} for retry attempt`);
                    testsToString = await splitWithTokens(currentTokenLimit, testsToString);
                }
                
                
                const temperature = 0.1 + (attempts * 0.05); 
                
                response = await ai.callAI(prompt, testsToString, [], undefined, false);
                
                
                if (!response) {
                    console.warn(`Attempt ${attempts+1}: No response received`);
                    response = null;
                    attempts++;
                    continue;
                }
                
                if (response.length < 500) {
                    console.warn(`Attempt ${attempts+1}: Response too short (${response.length} chars), retrying...`);
                    response = null;
                    attempts++;
                    continue;
                }
                
                
                const requiredSections = [
                    'FINAL SYSTEM SCORE', 
                    'SUMMARY OF FINDINGS', 
                    'TODO LIST', 
                    'FINAL VERDICT'
                ];
                
                const missingSections = requiredSections.filter(section => 
                    !response.includes(section)
                );
                
                if (missingSections.length > 0) {
                    console.warn(`Attempt ${attempts+1}: Response missing required sections: ${missingSections.join(', ')}`);
                    response = null;
                    attempts++;
                    continue;
                }
            } catch (error) {
                console.error(`Attempt ${attempts+1}: Error calling AI for analysis: ${error.message}`);
                attempts++;
                
                if (attempts >= maxAttempts) {
                    
                    console.warn("Max attempts reached, using fallback report generation");
                    response = generateFallbackReport(validTests);
                    break;
                }
                
                
                const baseDelay = 2000 * Math.pow(1.5, attempts);
                const jitter = Math.floor(Math.random() * 1000);
                await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
            }
        }
        
        if (!response) {
            console.error("Failed to get a valid analysis response after all attempts");
            response = generateFallbackReport(validTests);
        }
        
        
        const outputPath = path.join(reportsDir, 'analysis.MD');
        
        
        if (fs.existsSync(outputPath)) {
            const backupPath = path.join(reportsDir, `analysis_backup_${Date.now()}.MD`);
            fs.copyFileSync(outputPath, backupPath);
            console.log(`Backed up previous analysis to ${backupPath}`);
        }
        
        fs.writeFileSync(outputPath, response);
        console.log(`[✓] Tests analyzed and saved to ${outputPath}`);
        
        
        try {
            const score = extractScore(response);
            const analysisMetadata = {
                timestamp: new Date().toISOString(),
                testCount: validTests.length,
                testFiles: validTests.map(t => t.name),
                analysisLength: response.length,
                score: score,
                priority: extractPriority(response),
                status: extractStatus(response),
                nextStep: extractNextStep(response),
                todoCount: countTodoItems(response)
            };
            
            fs.writeFileSync(
                path.join(reportsDir, 'analysis_metadata.json'), 
                JSON.stringify(analysisMetadata, null, 2)
            );
            
            
            const summary = `
# Analysis Summary (${new Date().toISOString().split('T')[0]})

- Score: ${score !== null ? score + '/100' : 'Not found'}
- Status: ${analysisMetadata.status || 'Unknown'}
- Priority: ${analysisMetadata.priority || 'Unknown'}
- Next Step: ${analysisMetadata.nextStep || 'Not specified'}
- Todo Items: ${analysisMetadata.todoCount || 0}
- Test Files Analyzed: ${validTests.length}

See full analysis in: analysis.MD
`;
            
            fs.writeFileSync(
                path.join(reportsDir, 'analysis_summary.txt'), 
                summary
            );
        } catch (metadataError) {
            console.warn(`Could not create analysis metadata: ${metadataError.message}`);
        }
    } catch (error) {
        console.error(`Error analyzing tests: ${error.message}`);
        console.error(error.stack);
    }
}


function generateFallbackReport(validTests) {
    
    const testResults = validTests.map(test => {
        const passMatch = test.content.match(/PASSED|FAILED|SUCCEEDED|SUCCESS|FAIL/i);
        const scoreMatch = test.content.match(/Score:?\s*(\d+)/i);
        
        return {
            name: test.name,
            result: passMatch ? passMatch[0].toUpperCase() : 'UNKNOWN',
            score: scoreMatch ? parseInt(scoreMatch[1], 10) : null,
            size: test.size
        };
    });
    
    
    const passCount = testResults.filter(t => t.result.includes('PASS') || t.result.includes('SUCCESS')).length;
    const failCount = testResults.filter(t => t.result.includes('FAIL')).length;
    const unknownCount = testResults.length - passCount - failCount;
    
    const avgScore = testResults
        .filter(t => t.score !== null)
        .reduce((sum, t) => sum + t.score, 0) / 
        testResults.filter(t => t.score !== null).length || 0;
    
    
    return `
## 🧠 AI SYSTEM EVALUATION REPORT — FALLBACK (AUTO-GENERATED)
🗓️ Date: ${new Date().toISOString().split('T')[0]}
🧾 Evaluator: System Fallback Generator

---

## 🧨 FINAL SYSTEM SCORE: ${Math.round(avgScore)} / 100  
🧯 STATUS: ${avgScore > 80 ? 'Ready for Production' : avgScore > 60 ? 'Needs Refinement' : 'Needs Debugging'}
🧠 PRIORITY: ${avgScore > 80 ? 'Low' : avgScore > 60 ? 'Medium' : 'High'}
🛠️ NEXT STEP: Run detailed analysis when AI service is available

---

## 🧾 SUMMARY OF FINDINGS

This is an automatically generated fallback report due to AI analysis failure.
Based on simple metrics:
- Tests passed: ${passCount}/${testResults.length}
- Tests failed: ${failCount}/${testResults.length}
- Tests with unknown status: ${unknownCount}/${testResults.length}
- Average score (where available): ${Math.round(avgScore)}/100

---

## 📋 TODO LIST FOR IMPROVEMENT

- [ ] - Run full AI analysis when service is available
- [ ] - Address failed tests
- [ ] - Implement proper error handling
- [ ] - Add input validation
- [ ] - Improve test coverage

---

## 📊 COMPLEXITY VS PERFORMANCE OVERVIEW

| Test Status | Count | Percentage |
|-------------|-------|------------|
| Passed      | ${passCount} | ${Math.round((passCount/testResults.length)*100)}% |
| Failed      | ${failCount} | ${Math.round((failCount/testResults.length)*100)}% |
| Unknown     | ${unknownCount} | ${Math.round((unknownCount/testResults.length)*100)}% |

---

🧨 FINAL SCORE: ${Math.round(avgScore)} / 100  
🧠 PRIORITY: ${avgScore > 80 ? 'Low' : avgScore > 60 ? 'Medium' : 'High'}
🛠️ NEXT STEP: Re-run analysis

Note: This is a fallback report generated due to AI analysis failure. Please retry the analysis.
`;
}


function extractScore(analysis) {
    try {
        
        const patterns = [
            /FINAL (?:SYSTEM )?SCORE:?\s*(\d+)\s*\/\s*100/i,
            /SCORE:?\s*(\d+)\s*\/\s*100/i,
            /(\d+)\s*\/\s*100\s*(?:points|score)/i
        ];
        
        for (const pattern of patterns) {
            const match = analysis.match(pattern);
            if (match && match[1]) {
                return parseInt(match[1], 10);
            }
        }
        
        return null;
    } catch (error) {
        console.warn(`Could not extract score: ${error.message}`);
        return null;
    }
}


function extractPriority(analysis) {
    try {
        const priorityMatch = analysis.match(/PRIORITY:?\s*([A-Za-z\-]+)/i);
        return priorityMatch ? priorityMatch[1] : null;
    } catch (error) {
        return null;
    }
}


function extractStatus(analysis) {
    try {
        const statusMatch = analysis.match(/STATUS:?\s*([^]*?)(?:\n|🧠)/i);
        return statusMatch ? statusMatch[1].trim() : null;
    } catch (error) {
        return null;
    }
}


function extractNextStep(analysis) {
    try {
        const nextStepMatch = analysis.match(/NEXT STEP:?\s*([^]*?)(?:\n|$)/i);
        return nextStepMatch ? nextStepMatch[1].trim() : null;
    } catch (error) {
        return null;
    }
}


function countTodoItems(analysis) {
    try {
        const todoMatches = analysis.match(/- \[ \]/g);
        return todoMatches ? todoMatches.length : 0;
    } catch (error) {
        return 0;
    }
}


if (require.main === module) {
    aiAnalyzeTest().catch(err => {
        console.error("Fatal error in analysis:", err);
        process.exit(1);
    });
} else {
    
    module.exports = {
        aiAnalyzeTest,
        readTestFiles,
        countTokens,
        splitWithTokens,
        extractScore
    };
}

