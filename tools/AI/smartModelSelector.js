
function getModel(prompt, mode) {
    switch (mode) {
        case "browser":
          return {model: "openai/gpt-4.1", maxTokens: 120000};
        default:
            return {model: "openai/gpt-4.1", maxTokens: 120000};
            //return {model: "google/gemini-2.5-pro-exp-03-25:free", maxTokens: 200000}
    }
}

const models = [
    {
      "category": "Coding and Development",
      "models": [
        {
          "name": "mistralai/mistral-large-2411",
          "strengths": ["Long-context understanding", "Function calling", "System prompt optimization"],
          "bestApplications": ["Enterprise coding solutions", "API development"],
          "limitations": ["Higher cost than smaller models"],
          "contextWindow": 131072,
          "pricing": {
            "input": "$2/M tokens",
            "output": "$6/M tokens"
          }
        },
        {
          "name": "deepseek-ai/deepseek-v3-0324",
          "strengths": ["Chinese/English bilingual coding", "Web development", "Function calling"],
          "bestApplications": ["Full-stack development", "Technical documentation"],
          "limitations": ["Limited non-technical writing"],
          "contextWindow": 128000,
          "benchmarks": {
            "MMLU-Pro": 81.2,
            "LiveCodeBench": 49.2
          }
        },
        {
          "name": "anthropic/claude-3.5-sonnet",
          "strengths": ["Collaborative programming", "Code explanation", "Bug detection"],
          "bestApplications": ["Team code reviews", "Educational coding"],
          "limitations": ["Context window limitations"],
          "contextWindow": 200000
        }
      ]
    },
    {
      "category": "Creative Writing",
      "models": [
        {
          "name": "never-sleep/noromaid-20b",
          "strengths": ["Character dialogue generation", "Narrative consistency", "Roleplay scenarios"],
          "bestApplications": ["Interactive fiction", "Game NPC dialogues"],
          "limitations": ["Requires specific prompt templates"],
          "optimalSettings": {
            "temperature": 0.85,
            "repPenalty": 1.15
          }
        },
        {
          "name": "never-sleep/noromaid-v0.1-mixtral-8x7b-instruct-v3",
          "strengths": ["Multi-style adaptation", "Long-form storytelling", "Genre blending"],
          "bestApplications": ["Novel writing", "Screenplay development"],
          "limitations": ["Cost/performance balance"],
          "recommendedPresets": ["Mixtral-Instruct-v3"]
        },
        {
          "name": "goliath-ai/goliath-120b",
          "strengths": ["Deep context retention", "Complex plot weaving", "Character development"],
          "bestApplications": ["Epic fantasy writing", "Serialized content"],
          "limitations": ["High token cost"],
          "contextWindow": 6144
        }
      ]
    },
    {
      "category": "Enterprise Applications",
      "models": [
        {
          "name": "openai/gpt-4-32k",
          "strengths": ["Regulatory compliance", "Document analysis", "Multimodal processing"],
          "bestApplications": ["Legal contracts", "Technical reports"],
          "limitations": ["API cost structure"],
          "contextWindow": 32768
        },
        {
          "name": "meta-llama/llama-3.1-405b-instruct",
          "strengths": ["Open-source compliance", "Custom fine-tuning", "Data privacy"],
          "bestApplications": ["Internal knowledge bases", "Secure environments"],
          "limitations": ["EU licensing restrictions"],
          "contextWindow": 8192
        }
      ]
    }
  ]
  


module.exports = {getModel};

