// Content for the MIM28 ski trip app.
// Rooms, bingo squares and the vote are defined here. Challenges, the programme and the
// salamander's message start from here in the demo; on the real site they live in Supabase
// and are edited in the back office (admin.html).
(function () {
  var teamNames = ['Powder Pandas', 'Les Marmottes', 'Raclette Royale', 'Black Diamond Divas',
    'Fondue Fighters', 'Yeti Squad', null, 'Snow Problem', 'Genepi Gang', 'Chairlift Chatters',
    'Tartiflette Titans', 'Off-Piste Pirates', 'Slalom Llamas', 'Frozen Assets', 'The Snowballers'];
  var seedPoints = [860, 790, 735, 690, 640, 585, 430, 520, 470, 410, 365, 300, 255, 190, 120];
  var pool = ['Lea', 'Marco', 'Sofia', 'Jonas', 'Ines', 'Hugo', 'Mia', 'Arthur', 'Chloe', 'Lucas',
    'Emma', 'Paul', 'Nina', 'Tom', 'Jade', 'Louis', 'Sara', 'Max', 'Zoe', 'Adam',
    'Lina', 'Noe', 'Eva', 'Leo', 'Alma', 'Sam', 'Rose', 'Theo', 'Anna', 'Milo'];
  var palette = ['#FF5C7A', '#FF8A3D', '#FFC933', '#3DBE6B', '#2BD4C4', '#4DA3FF', '#8B7BFF', '#E05CFF',
    '#FF7AC8', '#B6E33A', '#00B8D9', '#FFA8A8', '#C9A0FF', '#7FE0A2', '#FFD98A',
    '#FFFFFF', '#9AA7FF', '#FF6B4A', '#5CE1E6', '#D4FF6A'];

  var teams = teamNames.map(function (name, i) {
    var members = [];
    for (var k = 0; k < 6; k++) members.push(pool[(i * 7 + k * 3) % pool.length]);
    return {
      id: 't' + (i + 1),
      code: i === 6 ? 'DEMO' : 'R' + (101 + i),
      room: 'Room ' + (i + 1),
      name: name,
      color: palette[i],
      members: i === 6 ? ['Noam', 'Thibault', 'Lea', 'Marco', 'Sofia', 'Jonas'] : members
    };
  });

  window.SEED = {
    summit: 2000,            // points that equal the summit
    today: 'tue',            // day shown before and after the trip (during it, the calendar decides)
    dates: { mon: '2027-01-04', tue: '2027-01-05', wed: '2027-01-06', thu: '2027-01-07', fri: '2027-01-08', sat: '2027-01-09' },
    racePart: 20,            // points for taking part in a race (the podium is awarded in the back office)
    palette: palette,
    teams: teams,
    seedPoints: seedPoints,
    message: "Bonjour skiers! Fresh snow, fresh challenges. Four ways to climb today. Don't forget your proof!",
    challenges: [
      { id: 'c1', day: 'tue', kind: 'race', title: 'Kilometre kings', points: 100, closes: '17:00', unit: 'km',
        desc: "Your room's average distance per person today. Upload a Strava screenshot.",
        prize: '100 / 70 / 50 for the top three, 20 for taking part' },
      { id: 'c2', day: 'tue', kind: 'race', title: 'Speed trap', points: 100, closes: '17:00', unit: 'km/h',
        desc: 'The fastest top speed recorded in your room today. Screenshot or it did not happen.',
        prize: '100 / 70 / 50 for the top three, 20 for taking part' },
      { id: 'c3', day: 'tue', kind: 'mission', title: 'First chair', points: 30, closes: '10:00',
        desc: 'Photo of your room on a chairlift before 10:00.' },
      { id: 'c4', day: 'tue', kind: 'mission', title: 'Salamander spotted', points: 40, closes: '18:00',
        desc: 'Draw the salamander in the snow. Artistic merit is not required.' }
    ],
    bingoPoints: 25, bingoLine: 50, bingoFull: 200,
    bingo: [
      'Selfie with someone called Armand', 'Spot a wild animal', 'Whole room on one chairlift photo',
      'Build a snowman wearing a hoodie', 'High-five a ski instructor', 'Whole room at breakfast before 8:30',
      'Photo with three other rooms', 'Ski in a conga line', 'Photo at the highest point of the resort',
      'Photo with the DJ', 'Human pyramid in the snow', 'Find a stranger in your jacket colour',
      'Cook something for another room', 'Synchronised snow angels', 'Learn a Savoyard word from a local',
      'Recreate a famous painting on the slopes'
    ].map(function (text, i) { return { id: 'b' + (i + 1), text: text }; }),
    votes: [
      { id: 'v1', title: 'Best costume', open: true,
        note: 'Which room wore it best? One vote each, and not for your own room.' }
    ],
    days: [['mon', 'Mon 4'], ['tue', 'Tue 5'], ['wed', 'Wed 6'], ['thu', 'Thu 7'], ['fri', 'Fri 8'], ['sat', 'Sat 9']],
    schedule: {
      mon: [['Evening', 'Bus leaves Fontainebleau', 'Parking de la Faisanderie. One suitcase and one small bag.']],
      tue: [['07:00', 'Arrival in Les Menuires', 'Welcome breakfast. Bags go in the luggage room.'],
            ['Morning', 'Ski passes and gear', 'Collect your discount wristband.'],
            ['Day', 'Free skiing', ''],
            ['16:00', 'Apres-ski', 'Free beer and a DJ set.'],
            ['17:00', 'Check-in', 'Apartments open.'],
            ['Evening', 'Dinner in the apartments', 'Then a welcome drink.']],
      wed: [['09:00', 'Free skiing', ''],
            ['12:00', 'BBQ on the slopes', ''],
            ['14:00', 'Apres-ski', ''],
            ['Evening', 'Wine tasting', ''],
            ['00:00', 'Costume night', 'Bring your costume.']],
      thu: [['09:00', 'Ski in costume', ''],
            ['Afternoon', 'Group photo', 'Results of the best-costume vote.'],
            ['15:00', 'Apres-ski', ''],
            ['00:00', 'Club night', 'With organised games.']],
      fri: [['All day', 'Free day', ''],
            ['00:00', 'Neon party', 'Bring something neon.']],
      sat: [['08:00', 'Check-out', 'Until 10:00. Leave the apartment clean.'],
            ['Daytime', 'Bus back to Fontainebleau', 'Arriving in the evening.']]
    }
  };
})();
