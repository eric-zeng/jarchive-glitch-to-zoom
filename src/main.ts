import fetch from 'node-fetch';
import fs from 'fs';
import { JSDOM } from 'jsdom';
import cliProgress from 'cli-progress';
import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';

interface OutputClue {
  category: string,
  air_date: string,
  question: string,
  value: string | null,
  answer: string,
  round: string,
  show_number: string
}

interface Output {
  [show_number: string]: {
    "Final Jeopardy!": {
      [category: string]: OutputClue[]
    },
    "Double Jeopardy!": {
      [category: string]: OutputClue[]
    },
    "Jeopardy!": {
      [category: string]: OutputClue[]
    }

  }
}

interface InputClue {
  category: string,
  value: number | string,
  clue: string,
  answer: string,
  order: number
}

interface Input {
  "jeopardy": InputClue[],
  "double jeopardy": InputClue[],
  "final jeopardy": {
    category: string,
    clue: string,
    answer: string
  }
}

const optionDefinitions = [
  {
    name: 'season',
    alias: 's',
    type: Number,
    description: 'Season number to fetch clues from (0-37)'
  }
];

const usageSections = [
  {
    header: 'Glitch J-Archive API to Zoom Jeopardy Clues Converter',
    content: 'Fetches clues from J-Archive, and puts them into the JSON format expected by Zoom Jeopardy'
  },
  {
    header: 'Arguments',
    optionList: optionDefinitions
  }
];

const args = commandLineArgs(optionDefinitions);
const usage = commandLineUsage(usageSections);

/**
 * This function converts a single Jeopardy or Double Jeopardy round from
 * Glitch to Zoom format.
 * Given an array of clues (from multiple categories), groups clues by array,
 * converts to Zoom jeopardy format, and returns an object mapping category
 * to clues.
 * @param clues
 * @param airDate
 * @param round
 * @param showNumber
 * @returns
 */
function cluesByCategory(clues: InputClue[], airDate: string, round: string, showNumber: string) {
  const output: { [category: string]: OutputClue[] } = {};
  for (let clue of clues) {
    if (clue.clue == 'Unrevealed') {
      throw new Error('Incomplete game');
    }
    if (!output[clue.category]) {
      output[clue.category] = [];
    }
    output[clue.category].push({
      category: clue.category,
      air_date: airDate,
      question: `'${clue.clue}'`,
      value: clue.value == 'Daily Double' ? 'Daily Double' : `$${clue.value}`,
      answer: clue.answer,
      round: round,
      show_number: showNumber
    });
  }

  // For daily double clues, figure out what the value was supposed to
  // be and replace it with the missing value.
  // Iterate through each category
  for (let entry of Object.entries(output)) {
    // Make a copy of the array that we can mutate
    let clueList = Array.from(entry[1]);

    // If the category has a daily double..
    if (clueList.find(c => c.value == 'Daily Double')) {

      // Find the position
      const ddIndex = clueList.findIndex(c => c.value == 'Daily Double');

      // Get the other clue values
      const values = clueList
          .filter(c => c.value !== 'Daily Double')
          .map(c => Number.parseInt(c.value!.substring(1)));

      // Compute the set difference with the actual set of values
      const allVals = round == 'Jeopardy!'
        ? [200, 400, 600, 800, 1000]
        : [400, 800, 1200, 1600, 2000];
      const missingVal = allVals.filter(v => !values.includes(v))[0];

      // Replace with the missing value
      clueList[ddIndex].value = `$${missingVal}`;
      output[entry[0]] = clueList;
    }
  }


  return output;
}

/**
 * Fetches the show number and dates for all of the Jeopardy episodes in the
 * given season.
 * @param season
 * @returns
 */
async function getShows(season: number) {
  try {
    // Fetch season page from J-Archive
    const res = await fetch(`https://j-archive.com/showseason.php?season=${season}`);
    const html: string = await res.text();

    // Use jsdom to query data
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extract show number and date from each episode link
    return Array.from(document.querySelectorAll('table a'))
      .map(a => a.textContent)
      .filter(text => text?.startsWith('#'))
      .map(text => {
        if (!text) {
          throw 'Error getting link string';
        }
        const showNumber = text.match(/(?<=#)([0-9]+)(?=,)/g);
        if (!showNumber || showNumber.length !== 1) {
          throw 'Error getting show number from string: ' + text;
        }
        try {
          const timestamp = text.split('\xa0')[1].split('-');
          return {
            show_number: Number.parseInt(showNumber[0]),
            year: Number.parseInt(timestamp[0]),
            month: Number.parseInt(timestamp[1]),
            day: Number.parseInt(timestamp[2])
          };
        } catch (e) {
          console.error(e);
          throw 'Error getting date from string: ' + text
        }
      });
  } catch (e) {
    throw e;
  }
}

async function main() {
  if (!args.season) {
    console.log('Must supply a valid season number between 1 and 37.');
    console.log('Usage:');
    console.log(usage);
  }

  // First, get all of the dates and show numbers for each episode in the season
  // from J-Archive
  const dates = await getShows(args.season);

  let output: Output = {};

  let progress = new cliProgress.Bar({});
  progress.start(dates.length, 0);

  let skipped = 0;

  for (let date of dates) {
    try {
      // Fetch the clue data from the J-Archive JSON glitch app
      const month = date.month.toString().padStart(2, '0');
      const day = date.day.toString().padStart(2, '0');
      const res = await fetch(`https://jarchive-json.glitch.me/game/${month}/${day}/${date.year}`);
      const data = await res.json() as Input;

      const finalJeopardy = data['final jeopardy'];

      const airDate = `${date.year}-${month}-${day}`;

      // Convert from Glitch to Zoom JSON format
      const show: Output = {
        [date.show_number.toString()]: {
          'Final Jeopardy!': {
            [finalJeopardy.category]: [{
              category: finalJeopardy.category,
              air_date: airDate,
              question: finalJeopardy.clue,
              value: null,
              answer: finalJeopardy.answer,
              round: 'Final Jeopardy!',
              show_number: date.show_number.toString()
            }]
          },
          'Double Jeopardy!': cluesByCategory(
            data['double jeopardy'],
            airDate,
            'Double Jeopardy!',
            date.show_number.toString()),

          'Jeopardy!': cluesByCategory(
            data['jeopardy'],
            airDate,
            'Jeopardy!',
            date.show_number.toString())
        }
      }
      output = {
        ...output,
        ...show
      }
      progress.increment();
    } catch (e) {
      if (e.message == 'Incomplete game') {
        skipped++;
      } else {
        console.log(e);
      }
      progress.increment();
      continue;
    }
  }
  progress.stop();
  console.log(`Skipped ${skipped} shows because of incomplete boards`);
  fs.writeFileSync(`jeopardy_season_${args.season}.json`, JSON.stringify(output));
  console.log('Done');
}

main();
