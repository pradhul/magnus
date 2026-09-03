/*
 * Magnus — Chapter 1: Loading Bay 0.
 *
 * Ten rooms of increasing difficulty. Each introduces or combines one idea.
 * `par` is the shortest solution found by tools/solve.js (moves + pulses + flips);
 * run `node tools/solve.js` to re-verify after editing a map.
 */
(function (root) {
  'use strict';

  const LEVELS = [
    {
      name: '1-1  The Twitch',
      teaches: 'Heavy iron pulls you.',
      story: 'The surge is over and every steel thing in the bay leans toward your hands. The crane rail across the coolant trench is the heaviest thing here. It wants you.',
      hint: 'Stand in line with the steel anchor (A) and pulse toward it. Heavy things move you.',
      par: 3,
      map: [
        '############',
        '#....~~....#',
        '#....~~....#',
        '#@...~~...A#',
        '#....~~....#',
        '#....~~..X.#',
        '############',
      ],
    },
    {
      name: '1-2  Dead Weight',
      teaches: 'Light iron comes to you. Plates open doors.',
      story: 'A scrap crate. Light enough that it comes to you, not the other way round. The blast door stays open only while something sits on the floor plate — and you can\'t be in two places.',
      hint: 'A pulled crate slides until it is right next to you. Stand where the crate should stop beside you.',
      par: 9,
      map: [
        '############',
        '#..........#',
        '#@_....i...#',
        '#..........#',
        '######D#####',
        '#.....X....#',
        '############',
      ],
    },
    {
      name: '1-3  The Trench',
      teaches: 'Iron that falls into a pit fills it.',
      story: 'The catwalk over the acid trench is gone. Iron sinks. Sunk iron makes a floor.',
      hint: 'Your field only reaches the first body in line. Pull twice.',
      par: 11,
      map: [
        '###########',
        '#....~~...#',
        '#@...~~.ii#',
        '#....~~..X#',
        '###########',
      ],
    },
    {
      name: '1-4  Poles',
      teaches: 'Like poles push. Flip your own pole.',
      story: 'Not all of the salvage is dead iron. Some of it is magnetised — a red N face or a blue S face. Unlike poles pull, like poles push, and your own pole flips on command.',
      hint: 'Pull the block into the trench row first, then flip to S and push it in from the side.',
      par: 14,
      map: [
        '##########',
        '#....#..~#',
        '#....#.X~#',
        '#@...~..~#',
        '#....#..~#',
        '#..s.#..~#',
        '##########',
      ],
    },
    {
      name: '1-5  The Window',
      teaches: 'Fields pass through glass. Bodies do not.',
      story: 'The foreman\'s window. Glass is nothing to a field and everything to a body. Both plates behind it must be held down before the door will move.',
      hint: 'Push the top block away from you; pull the bottom one toward you. One needs N, one needs S.',
      par: 11,
      map: [
        '#############',
        '#....=n..._##',
        '#....=......#',
        '#@...=.=_.n.#',
        '#....=......#',
        '##D##########',
        '##X##########',
        '#############',
      ],
    },
    {
      name: '1-6  Launch',
      teaches: 'Pillars throw you. Flight only ends when something stops it.',
      story: 'The magnetised pillars are the heaviest things in the bay. They don\'t come to you. You go to them — or away from them, fast — and a body in flight stops only when something stops it.',
      hint: 'A like pole throws you away; an unlike pole drags you in. Mind what you would land on.',
      par: 6,
      map: [
        '###############',
        '#N@..~~~~.....#',
        '#~~~~~~~~~~~~.#',
        '#N...~~~~~~~..#',
        '#~X~~~~~~~~~~~#',
        '###############',
      ],
    },
    {
      name: '1-7  Recoil',
      teaches: 'Push what cannot move and the push comes back to you.',
      story: 'Brace a block against something solid and shove. The block goes nowhere. You do.',
      hint: 'Get the block into your row, pin it against the far wall, then push it again. Flying ends where the wall is — make sure that is floor.',
      par: 11,
      map: [
        '############',
        '#X.~~~.....#',
        '#..~~~@....#',
        '#~.~~~..n..#',
        '############',
      ],
    },
    {
      name: '1-8  Shield',
      teaches: 'The first body in line takes the whole field.',
      story: 'Iron in the line of your field takes all of it. Whatever stands behind gets nothing.',
      hint: 'You cannot push iron. Pull it out of the row from below, then deal with the block.',
      par: 13,
      map: [
        '#############',
        '#....#.~....#',
        '#@..i.n~..X.#',
        '#....#.~....#',
        '#......~....#',
        '#############',
      ],
    },
    {
      name: '1-9  Counterweights',
      teaches: 'Two plates, two bodies, one field.',
      story: 'Two plates hold the booth door. One is behind glass. The crate in your own room shields everything behind it.',
      hint: 'Pull the crate once to line it up with the plate, then once more from below. Push the block from a spot to the right of the crate.',
      par: 16,
      map: [
        '##############',
        '#@..i.=.n.._##',
        '#.....=......#',
        '#._...=......#',
        '#.....=......#',
        '#####D########',
        '#....X.......#',
        '##############',
      ],
    },
    {
      name: '1-10  The Booth',
      teaches: 'Everything at once.',
      story: 'The control booth. Launch, bridge, window, recoil. Lock the bay before it locks you.',
      hint: 'Launch first — the S block is your brake, so do not pull it. Then flip and push it into the pit. Both plates hold the door: one through the window, one with the crate. In the cellar, pin the block and recoil off it.',
      par: 20,
      map: [
        '################',
        '#N@...~~~..s.~~#',
        '#~~~~~~~~~~~.~~#',
        '##_..n.=.....~~#',
        '########i.._.~~#',
        '#########D######',
        '#X~~~~~~~.n....#',
        '################',
      ],
    },
  ];

  root.MAGNUS_LEVELS = LEVELS;
  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
