// Build the travel-screen polaroid library: two iconic pop-culture moments
// per year for the last 80 years, fetched as REAL photos via DuckDuckGo
// images (keyless, same approach as lib/refimages.ts), square-cropped to
// 360x360 JPEGs in public/polaroids/, indexed by public/polaroids/manifest.json
// as [{ y, l, f }] (year, label, filename).
//
// Run: node scripts/fetch-polaroids.mjs            (skips years already done)
//      node scripts/fetch-polaroids.mjs --force    (refetch everything)

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ffmpeg from "ffmpeg-static";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "polaroids");
const FORCE = process.argv.includes("--force");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// [year, short polaroid caption, image search query]
const ENTRIES = [
  [1946, "It's a Wonderful Life", "It's a Wonderful Life 1946 movie still"],
  [1946, "Tupperware", "vintage Tupperware party 1940s photo"],
  [1947, "Jackie Robinson", "Jackie Robinson 1947 Brooklyn Dodgers photo"],
  [1947, "Howdy Doody", "Howdy Doody show 1947 photo"],
  [1948, "Polaroid Camera", "Polaroid Land Camera 1948 photo"],
  [1948, "Scrabble", "vintage Scrabble board game 1948"],
  [1949, "Candy Land", "vintage Candy Land board game 1949"],
  [1949, "The Lone Ranger", "The Lone Ranger 1949 TV show photo"],
  [1950, "Peanuts", "Peanuts comic strip 1950 Charlie Brown Snoopy"],
  [1950, "Silly Putty", "vintage Silly Putty egg 1950s"],
  [1951, "I Love Lucy", "I Love Lucy 1951 Lucille Ball photo"],
  [1951, "Alice in Wonderland", "Disney Alice in Wonderland 1951 still"],
  [1952, "Mr. Potato Head", "vintage Mr Potato Head toy 1952"],
  [1952, "Singin' in the Rain", "Singin in the Rain 1952 Gene Kelly lamppost"],
  [1953, "Corvette", "1953 Chevrolet Corvette photo"],
  [1953, "Peter Pan", "Disney Peter Pan 1953 still"],
  [1954, "Rock Around the Clock", "Bill Haley and His Comets 1954 photo"],
  [1954, "Godzilla", "Godzilla 1954 original movie still"],
  [1955, "Disneyland Opens", "Disneyland opening day 1955 photo"],
  [1955, "James Dean", "James Dean Rebel Without a Cause 1955 photo"],
  [1956, "Elvis Presley", "Elvis Presley Ed Sullivan Show 1956 photo"],
  [1956, "Play-Doh", "vintage Play-Doh cans 1950s"],
  [1957, "Sputnik", "Sputnik satellite 1957 photo"],
  [1957, "American Bandstand", "American Bandstand 1957 Dick Clark photo"],
  [1958, "Hula Hoop", "hula hoop craze 1958 kids photo"],
  [1958, "LEGO Brick", "vintage LEGO bricks 1958"],
  [1959, "Barbie", "original Barbie doll 1959 photo"],
  [1959, "The Twilight Zone", "The Twilight Zone 1959 Rod Serling photo"],
  [1960, "The Flintstones", "The Flintstones 1960 cartoon still"],
  [1960, "Etch A Sketch", "vintage Etch A Sketch toy 1960"],
  [1961, "First Man in Space", "Alan Shepard Freedom 7 1961 photo"],
  [1961, "101 Dalmatians", "Disney 101 Dalmatians 1961 still"],
  [1962, "Spider-Man Debuts", "Amazing Fantasy 15 1962 Spider-Man comic cover"],
  [1962, "The Jetsons", "The Jetsons 1962 cartoon still"],
  [1963, "Beatlemania", "Beatlemania screaming fans 1963 photo"],
  [1963, "Easy-Bake Oven", "vintage Easy-Bake Oven 1963 toy"],
  [1964, "Beatles in America", "The Beatles Ed Sullivan Show 1964 photo"],
  [1964, "G.I. Joe", "vintage GI Joe action figure 1964"],
  [1965, "The Sound of Music", "The Sound of Music 1965 Julie Andrews hills"],
  [1965, "Operation Game", "vintage Operation board game 1965"],
  [1966, "Star Trek", "Star Trek original series 1966 Kirk Spock photo"],
  [1966, "Batman TV Show", "Batman 1966 Adam West TV show photo"],
  [1967, "Summer of Love", "Summer of Love 1967 San Francisco photo"],
  [1967, "Lite-Brite", "vintage Lite-Brite toy 1967"],
  [1968, "Hot Wheels", "vintage Hot Wheels cars 1968"],
  [1968, "2001: A Space Odyssey", "2001 A Space Odyssey 1968 movie still"],
  [1969, "Moon Landing", "Apollo 11 moon landing 1969 Buzz Aldrin photo"],
  [1969, "Woodstock", "Woodstock 1969 crowd photo"],
  [1970, "Jackson 5", "Jackson 5 1970 photo young Michael"],
  [1970, "Nerf Ball", "original Nerf ball 1970 vintage"],
  [1971, "Walt Disney World", "Walt Disney World opening 1971 photo"],
  [1971, "Soul Train", "Soul Train 1971 TV show photo"],
  [1972, "Pong", "Atari Pong arcade 1972 photo"],
  [1972, "The Godfather", "The Godfather 1972 Marlon Brando still"],
  [1973, "Schoolhouse Rock", "Schoolhouse Rock 1973 cartoon still"],
  [1973, "Secretariat", "Secretariat 1973 Triple Crown photo"],
  [1974, "Dungeons & Dragons", "original Dungeons and Dragons 1974 box set"],
  [1974, "Happy Days", "Happy Days 1974 Fonzie photo"],
  [1975, "Jaws", "Jaws 1975 movie poster shark"],
  [1975, "Pet Rock", "Pet Rock 1975 original box photo"],
  [1976, "Bicentennial", "American Bicentennial celebration 1976 photo"],
  [1976, "Charlie's Angels", "Charlie's Angels 1976 TV show photo"],
  [1977, "Star Wars", "Star Wars 1977 premiere theater marquee photo"],
  [1977, "Atari 2600", "Atari 2600 console 1977 photo"],
  [1978, "Grease", "Grease 1978 John Travolta Olivia Newton-John still"],
  [1978, "Space Invaders", "Space Invaders arcade 1978 photo"],
  [1979, "Sony Walkman", "original Sony Walkman 1979 photo"],
  [1979, "Happy Meal", "McDonald's Happy Meal 1979 original photo"],
  [1980, "Pac-Man", "Pac-Man arcade game 1980 photo"],
  [1980, "Rubik's Cube", "Rubik's Cube 1980 vintage photo"],
  [1981, "MTV Launch", "MTV launch 1981 moon man logo photo"],
  [1981, "Raiders of the Lost Ark", "Raiders of the Lost Ark 1981 Indiana Jones still"],
  [1982, "E.T.", "ET the Extra-Terrestrial 1982 bike moon still"],
  [1982, "Thriller", "Michael Jackson Thriller 1982 photo"],
  [1983, "Cabbage Patch Kids", "Cabbage Patch Kids craze 1983 store photo"],
  [1983, "Return of the Jedi", "Return of the Jedi 1983 movie still"],
  [1984, "Ghostbusters", "Ghostbusters 1984 movie still"],
  [1984, "Transformers", "vintage Transformers toys 1984 Optimus Prime"],
  [1985, "Back to the Future", "Back to the Future 1985 DeLorean still"],
  [1985, "Nintendo NES", "Nintendo NES console 1985 photo"],
  [1986, "Top Gun", "Top Gun 1986 Tom Cruise still"],
  [1986, "The Legend of Zelda", "Legend of Zelda 1986 NES gold cartridge"],
  [1987, "Full House", "Full House 1987 TV show cast photo"],
  [1987, "Koosh Ball", "vintage Koosh ball 1987"],
  [1988, "Roger Rabbit", "Who Framed Roger Rabbit 1988 still"],
  [1988, "Ninja Turtles", "Teenage Mutant Ninja Turtles 1988 cartoon toys"],
  [1989, "Game Boy", "original Nintendo Game Boy 1989 photo"],
  [1989, "Batman", "Batman 1989 Michael Keaton still"],
  [1990, "Home Alone", "Home Alone 1990 Kevin scream still"],
  [1990, "Fresh Prince", "Fresh Prince of Bel-Air 1990 Will Smith photo"],
  [1991, "Super Nintendo", "Super Nintendo SNES console 1991 photo"],
  [1991, "Terminator 2", "Terminator 2 1991 movie still"],
  [1992, "Aladdin", "Disney Aladdin 1992 still"],
  [1992, "Barney", "Barney and Friends 1992 purple dinosaur photo"],
  [1993, "Jurassic Park", "Jurassic Park 1993 T-Rex still"],
  [1993, "Power Rangers", "Mighty Morphin Power Rangers 1993 photo"],
  [1994, "The Lion King", "The Lion King 1994 Simba still"],
  [1994, "Friends", "Friends 1994 TV show cast couch photo"],
  [1995, "Toy Story", "Toy Story 1995 Woody Buzz still"],
  [1995, "Beanie Babies", "Beanie Babies craze 1995 photo"],
  [1996, "Tickle Me Elmo", "Tickle Me Elmo craze 1996 photo"],
  [1996, "Nintendo 64", "Nintendo 64 console 1996 photo"],
  [1997, "Titanic", "Titanic 1997 Jack Rose bow still"],
  [1997, "Tamagotchi", "Tamagotchi 1997 virtual pet photo"],
  [1998, "Pokémon", "Pokemon Red Blue Game Boy 1998 photo"],
  [1998, "Furby", "Furby craze 1998 photo"],
  [1999, "SpongeBob", "SpongeBob SquarePants 1999 still"],
  [1999, "The Matrix", "The Matrix 1999 Neo still"],
  [2000, "Razor Scooter", "Razor scooter craze 2000 kids photo"],
  [2000, "PlayStation 2", "PlayStation 2 console 2000 photo"],
  [2001, "Harry Potter", "Harry Potter Sorcerer's Stone 2001 movie still"],
  [2001, "iPod", "original Apple iPod 2001 photo"],
  [2002, "Spider-Man", "Spider-Man 2002 Tobey Maguire still"],
  [2002, "American Idol", "American Idol 2002 judges photo"],
  [2003, "Finding Nemo", "Finding Nemo 2003 still"],
  [2003, "Beyblade", "Beyblade toys craze 2003 photo"],
  [2004, "Nintendo DS", "Nintendo DS console 2004 photo"],
  [2004, "Napoleon Dynamite", "Napoleon Dynamite 2004 vote for pedro still"],
  [2005, "YouTube", "YouTube launch 2005 first video me at the zoo"],
  [2005, "Xbox 360", "Xbox 360 console 2005 photo"],
  [2006, "Nintendo Wii", "Nintendo Wii console 2006 wiimote photo"],
  [2006, "High School Musical", "High School Musical 2006 cast photo"],
  [2007, "iPhone", "original iPhone 2007 Steve Jobs photo"],
  [2007, "Guitar Hero", "Guitar Hero III 2007 controller photo"],
  [2008, "The Dark Knight", "The Dark Knight 2008 Joker still"],
  [2008, "Iron Man", "Iron Man 2008 movie still"],
  [2009, "Avatar", "Avatar 2009 movie still Pandora"],
  [2009, "Angry Birds", "Angry Birds game 2009 photo"],
  [2010, "Toy Story 3", "Toy Story 3 2010 still"],
  [2010, "Silly Bandz", "Silly Bandz craze 2010 photo"],
  [2011, "Minecraft", "Minecraft 2011 game screenshot"],
  [2011, "Deathly Hallows", "Harry Potter Deathly Hallows Part 2 2011 premiere photo"],
  [2012, "Gangnam Style", "PSY Gangnam Style 2012 dance photo"],
  [2012, "The Avengers", "The Avengers 2012 movie still"],
  [2013, "Frozen", "Frozen 2013 Elsa still"],
  [2013, "Rainbow Loom", "Rainbow Loom bracelets craze 2013 photo"],
  [2014, "Ice Bucket Challenge", "Ice Bucket Challenge 2014 photo"],
  [2014, "Flappy Bird", "Flappy Bird game 2014 screenshot"],
  [2015, "The Force Awakens", "Star Wars Force Awakens 2015 BB-8 still"],
  [2015, "Hoverboards", "hoverboard craze 2015 photo"],
  [2016, "Pokémon GO", "Pokemon GO 2016 people playing phones photo"],
  [2016, "Stranger Things", "Stranger Things 2016 kids bikes photo"],
  [2017, "Fidget Spinner", "fidget spinner craze 2017 photo"],
  [2017, "Nintendo Switch", "Nintendo Switch console 2017 photo"],
  [2018, "Fortnite", "Fortnite 2018 game screenshot"],
  [2018, "Black Panther", "Black Panther 2018 Wakanda still"],
  [2019, "Avengers: Endgame", "Avengers Endgame 2019 movie still"],
  [2019, "Baby Yoda", "Baby Yoda Mandalorian 2019 photo"],
  [2020, "Animal Crossing", "Animal Crossing New Horizons 2020 screenshot"],
  [2020, "Among Us", "Among Us game 2020 screenshot"],
  [2021, "Squid Game", "Squid Game 2021 red light green light still"],
  [2021, "Roblox", "Roblox 2021 game screenshot"],
  [2022, "Wordle", "Wordle game 2022 grid screenshot"],
  [2022, "Top Gun: Maverick", "Top Gun Maverick 2022 still"],
  [2023, "Barbie Movie", "Barbie movie 2023 Margot Robbie still"],
  [2023, "Eras Tour", "Taylor Swift Eras Tour 2023 concert photo"],
  [2024, "Paris Olympics", "Paris Olympics 2024 opening ceremony photo"],
  [2024, "Inside Out 2", "Inside Out 2 2024 still"],
  [2025, "Switch 2", "Nintendo Switch 2 2025 console photo"],
  [2025, "A Minecraft Movie", "A Minecraft Movie 2025 still"],
];

// Stock-photo sites watermark their previews (alamy plasters its logo over
// everything) — skip them entirely; editorial/fan/wiki sources are clean.
const BLOCKED =
  /alamy|gettyimages|istockphoto|shutterstock|dreamstime|depositphotos|123rf|agefotostock|bigstock|stock\.adobe|ftcdn\.net|superstock|mediastorehouse|bridgemanimages|granger|photo12|stockfood|prints-online/i;

async function ddgUrls(query) {
  const page = await fetch(
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
    { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) },
  );
  const html = await page.text();
  const vqd = html.match(/vqd=["']?([\d-]+)/)?.[1];
  if (!vqd) throw new Error("no vqd");
  const u = new URL("https://duckduckgo.com/i.js");
  u.searchParams.set("l", "us-en");
  u.searchParams.set("o", "json");
  u.searchParams.set("q", query);
  u.searchParams.set("vqd", vqd);
  u.searchParams.set("f", ",,,");
  u.searchParams.set("p", "1");
  const res = await fetch(u, {
    headers: { "User-Agent": UA, Referer: "https://duckduckgo.com/" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`i.js ${res.status}`);
  const json = await res.json();
  return (json.results ?? [])
    .map((r) => r.image || r.thumbnail)
    .filter((u) => Boolean(u) && !BLOCKED.test(u));
}

async function download(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const mime = (res.headers.get("content-type") || "").split(";")[0].trim();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 8_000 || buf.length > 10_000_000) return null;
  return buf;
}

function squareCrop(inPath, outPath) {
  return new Promise((resolve) => {
    const p = spawn(ffmpeg, [
      "-y", "-i", inPath,
      "-vf", "scale=360:360:force_original_aspect_ratio=increase,crop=360:360",
      "-frames:v", "1", "-q:v", "5", outPath,
    ]);
    p.on("close", (c) => resolve(c === 0));
    p.on("error", () => resolve(false));
  });
}

async function fetchOne(entry, suffix) {
  const [year, label, query] = entry;
  const file = `y${year}${suffix}.jpg`;
  const outPath = path.join(OUT_DIR, file);
  if (!FORCE && (await fs.access(outPath).then(() => true, () => false))) {
    return { y: year, l: label, f: file };
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const urls = await ddgUrls(query);
      for (const url of urls.slice(0, 8)) {
        const buf = await download(url).catch(() => null);
        if (!buf) continue;
        const tmp = path.join(OUT_DIR, `.tmp-${file}`);
        await fs.writeFile(tmp, buf);
        const ok = await squareCrop(tmp, outPath);
        await fs.rm(tmp, { force: true });
        if (ok) return { y: year, l: label, f: file };
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
  }
  console.warn(`MISS ${year} ${label}`);
  return null;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const manifest = [];
  let done = 0;
  // small concurrency + stagger to stay polite with DDG
  const queue = ENTRIES.map((e, i) => [e, i % 2 === 0 ? "a" : "b"]);
  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length > 0) {
      const [entry, suffix] = queue.shift();
      const item = await fetchOne(entry, suffix);
      if (item) manifest.push(item);
      done++;
      if (done % 10 === 0) console.log(`${done}/${ENTRIES.length}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  });
  await Promise.all(workers);
  manifest.sort((a, b) => a.y - b.y || a.f.localeCompare(b.f));
  await fs.writeFile(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest),
  );
  console.log(`done: ${manifest.length}/${ENTRIES.length} polaroids`);
}

main();
