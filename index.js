const fs = require("fs");
const csv = require("csv-parser");
const stopword = require("stopword");
const nlp = require("compromise");

function cleanText(text, priorityWords) {
 
  text = text.replace(/\[.*?\]|\(.*?\)|\{.*?\}/g, (match) => {
   
    const wordsInBrackets = match.slice(1, -1).split(/\s+/).map(word => word.trim().toLowerCase());

    const preservedWords = wordsInBrackets.filter(word => priorityWords.some(pw => pw.toLowerCase() === word));

    return preservedWords.length ? preservedWords.join(" ") : '';
  });

  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ") 
    .replace(/\s+/g, " ") 
    .trim();
}


function isMeaningfulWord(word) {
  const doc = nlp(word);
  const hasMeaning =
    doc.nouns().out("array").length > 0 ||
    doc.verbs().out("array").length > 0 ||
    doc.adjectives().out("array").length > 0;
  const isAlphabetic = /^[a-z]+$/.test(word);
  const isRandom =
    /[bcdfghjklmnpqrstvwxyz]{4,}/i.test(word) || 
    /[aeiou]{4,}/i.test(word) || 
    word.length > 15;

  return hasMeaning && isAlphabetic && !isRandom && word.length > 2;
}

function getPluralForm(word) {
  const pluralRules = {
    "y$": "ies",
    "s$": "s",
    "ch$": "ches",
    "sh$": "shes",
    "o$": "oes",
    "f$": "ves",
    "fe$": "ves",
  };

  if (word.endsWith("s")) {
    return word;
  }

  for (let rule in pluralRules) {
    if (new RegExp(rule).test(word)) {
      return word.replace(new RegExp(rule), pluralRules[rule]);
    }
  }

  return word + "s";
}

function applyPluralCorrection(words) {
  const wordSet = new Set(words);
  const pluralMap = {};

  words.forEach((word) => {
    const pluralForm = getPluralForm(word);
    const singularForm = word.endsWith("s") ? word.slice(0, -1) : word; 

    if (wordSet.has(singularForm) && wordSet.has(pluralForm) && pluralForm !== word) {
      pluralMap[word] = pluralForm;
    }
  });

  return words.map((word) => pluralMap[word] || word);
}

function buildWordFrequencyMap(dataset, ignoredWords) {
  const frequencyMap = {};
  dataset.forEach((line) => {
    let words = cleanText(line, []).split(/\s+/);
    words = words.filter((word) => !ignoredWords.has(word)); 
    words = stopword.removeStopwords(words);

    words.forEach((word) => {
      if (isMeaningfulWord(word)) {
        frequencyMap[word] = (frequencyMap[word] || 0) + 1;
      }
    });
  });
  return frequencyMap;
}

function extractTopWords(line, frequencyMap, maxWords, ignoredWords, priorityWords) {
  let words = cleanText(line, priorityWords).split(/\s+/);
  words = stopword.removeStopwords(words.filter((word) => !ignoredWords.has(word)));
  words = words.filter((word) => isMeaningfulWord(word));

  words = applyPluralCorrection(words);

  let uniqueWords = [...new Set(words)];

  const priorityInLine = priorityWords.filter((word) => uniqueWords.includes(word));
  uniqueWords = uniqueWords.filter((word) => !priorityWords.includes(word));

  const rankedWords = uniqueWords
    .filter((word) => frequencyMap[word])
    .sort((a, b) => frequencyMap[b] - frequencyMap[a]);

  const finalWords = [...priorityInLine, ...rankedWords];

  return finalWords.slice(0, maxWords).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function processDataset(dataset, ignoredWords, priorityWords) {
  const cleanedData = dataset.map((line) => cleanText(line, priorityWords));
  const frequencyMap = buildWordFrequencyMap(cleanedData, ignoredWords);

  return cleanedData.map((line) =>
    extractTopWords(line, frequencyMap, 4, ignoredWords, priorityWords)
  );
}

const inputFilePath = "./allcsv/moringa.csv";
const outputFilePath1 = "./processed_data.json";
const outputFilePath2 = "./processed_lines.json";
const ignoredWordsFilePath = "./ignored_words.json";
const priorityWordsFilePath = "./allpriority/moringa_priority_words.json";

let productData = [];

const ignoredWords = new Set(
  JSON.parse(fs.readFileSync(ignoredWordsFilePath, "utf8"))
);
const priorityWords = JSON.parse(fs.readFileSync(priorityWordsFilePath, "utf8"));

fs.createReadStream(inputFilePath)
  .pipe(csv())
  .on("data", (row) => {
    const fullRow = Object.values(row).join(" ");
    if (fullRow.trim()) {
      productData.push(fullRow);
    }
  })
  .on("end", () => {
    console.log("CSV file successfully read.");

    const processedData = processDataset(productData, ignoredWords, priorityWords);

    const resultWithOriginal = productData.map((original, index) => ({
      original,
      processed: processedData[index],
    }));

    fs.writeFileSync(outputFilePath1, JSON.stringify(resultWithOriginal, null, 2), "utf8");
    console.log(`Processed data written to ${outputFilePath1}`);

    const resultOnlyProcessed = [...new Set(processedData)];
    fs.writeFileSync(outputFilePath2, JSON.stringify(resultOnlyProcessed, null, 2), "utf8");
    console.log(`Processed lines written to ${outputFilePath2}`);
  });
