-- ============================================================
-- FIFA World Cup 2026 — 104 matches seed
-- All kickoffs stored as UTC. IST = UTC + 5h30m.
-- Sources cross-checked: FIFA, ESPN, Sky Sports, NBC Sports, CBS Sports, Wikipedia.
-- Paste into Supabase SQL Editor AFTER 0001_schema.sql.
-- ============================================================

insert into public.matches (id, stage, group_name, kickoff_utc, home_team, away_team, home_source, away_source, venue) values

-- ── GROUP STAGE ──────────────────────────────────────────────
-- Match 1  Jun 12 00:30 IST
(1,  'group', 'A', '2026-06-11 19:00:00+00', 'Mexico',             'South Africa',        null, null, 'Estadio Azteca, Mexico City'),
-- Match 2  Jun 12 07:30 IST
(2,  'group', 'A', '2026-06-12 02:00:00+00', 'South Korea',        'Czechia',             null, null, 'Estadio Akron, Guadalajara'),
-- Match 3  Jun 13 00:30 IST
(3,  'group', 'B', '2026-06-12 19:00:00+00', 'Canada',             'Bosnia-Herzegovina',  null, null, 'BMO Field, Toronto'),
-- Match 4  Jun 13 06:30 IST
(4,  'group', 'D', '2026-06-13 01:00:00+00', 'USA',                'Paraguay',            null, null, 'SoFi Stadium, Los Angeles'),
-- Match 5  Jun 14 00:30 IST
(5,  'group', 'B', '2026-06-13 19:00:00+00', 'Qatar',              'Switzerland',         null, null, 'Levi''s Stadium, San Jose'),
-- Match 6  Jun 14 03:30 IST
(6,  'group', 'C', '2026-06-13 22:00:00+00', 'Brazil',             'Morocco',             null, null, 'MetLife Stadium, East Rutherford'),
-- Match 7  Jun 14 06:30 IST
(7,  'group', 'C', '2026-06-14 01:00:00+00', 'Haiti',              'Scotland',            null, null, 'Gillette Stadium, Boston'),
-- Match 8  Jun 14 09:30 IST
(8,  'group', 'D', '2026-06-14 04:00:00+00', 'Australia',          'Türkiye',             null, null, 'BC Place, Vancouver'),
-- Match 9  Jun 14 22:30 IST
(9,  'group', 'E', '2026-06-14 17:00:00+00', 'Germany',            'Curaçao',             null, null, 'NRG Stadium, Houston'),
-- Match 10 Jun 15 01:30 IST
(10, 'group', 'F', '2026-06-14 20:00:00+00', 'Netherlands',        'Japan',               null, null, 'AT&T Stadium, Arlington'),
-- Match 11 Jun 15 04:30 IST
(11, 'group', 'E', '2026-06-14 23:00:00+00', 'Ivory Coast',        'Ecuador',             null, null, 'Lincoln Financial Field, Philadelphia'),
-- Match 12 Jun 15 07:30 IST
(12, 'group', 'F', '2026-06-15 02:00:00+00', 'Sweden',             'Tunisia',             null, null, 'Estadio BBVA, Monterrey'),
-- Match 13 Jun 15 21:30 IST
(13, 'group', 'H', '2026-06-15 16:00:00+00', 'Spain',              'Cape Verde',          null, null, 'Mercedes-Benz Stadium, Atlanta'),
-- Match 14 Jun 16 00:30 IST
(14, 'group', 'G', '2026-06-15 19:00:00+00', 'Belgium',            'Egypt',               null, null, 'Lumen Field, Seattle'),
-- Match 15 Jun 16 03:30 IST
(15, 'group', 'H', '2026-06-15 22:00:00+00', 'Saudi Arabia',       'Uruguay',             null, null, 'Hard Rock Stadium, Miami'),
-- Match 16 Jun 16 06:30 IST
(16, 'group', 'G', '2026-06-16 01:00:00+00', 'Iran',               'New Zealand',         null, null, 'SoFi Stadium, Los Angeles'),
-- Match 17 Jun 17 00:30 IST
(17, 'group', 'I', '2026-06-16 19:00:00+00', 'France',             'Senegal',             null, null, 'MetLife Stadium, East Rutherford'),
-- Match 18 Jun 17 03:30 IST
(18, 'group', 'I', '2026-06-16 22:00:00+00', 'Iraq',               'Norway',              null, null, 'Gillette Stadium, Boston'),
-- Match 19 Jun 17 06:30 IST
(19, 'group', 'J', '2026-06-17 01:00:00+00', 'Argentina',          'Algeria',             null, null, 'Arrowhead Stadium, Kansas City'),
-- Match 20 Jun 17 09:30 IST
(20, 'group', 'J', '2026-06-17 04:00:00+00', 'Austria',            'Jordan',              null, null, 'Levi''s Stadium, San Jose'),
-- Match 21 Jun 17 22:30 IST
(21, 'group', 'K', '2026-06-17 17:00:00+00', 'Portugal',           'Congo DR',            null, null, 'NRG Stadium, Houston'),
-- Match 22 Jun 18 01:30 IST
(22, 'group', 'L', '2026-06-17 20:00:00+00', 'England',            'Croatia',             null, null, 'AT&T Stadium, Arlington'),
-- Match 23 Jun 18 04:30 IST
(23, 'group', 'L', '2026-06-17 23:00:00+00', 'Ghana',              'Panama',              null, null, 'BMO Field, Toronto'),
-- Match 24 Jun 18 07:30 IST
(24, 'group', 'K', '2026-06-18 02:00:00+00', 'Uzbekistan',         'Colombia',            null, null, 'Estadio Azteca, Mexico City'),

-- Matchday 2
-- Match 25 Jun 18 21:30 IST
(25, 'group', 'A', '2026-06-18 16:00:00+00', 'Czechia',            'South Africa',        null, null, 'Mercedes-Benz Stadium, Atlanta'),
-- Match 26 Jun 19 00:30 IST
(26, 'group', 'B', '2026-06-18 19:00:00+00', 'Switzerland',        'Bosnia-Herzegovina',  null, null, 'SoFi Stadium, Los Angeles'),
-- Match 27 Jun 19 03:30 IST
(27, 'group', 'B', '2026-06-18 22:00:00+00', 'Canada',             'Qatar',               null, null, 'BC Place, Vancouver'),
-- Match 28 Jun 19 08:30 IST
(28, 'group', 'A', '2026-06-19 03:00:00+00', 'Mexico',             'South Korea',         null, null, 'Estadio Akron, Guadalajara'),
-- Match 29 Jun 20 00:30 IST
(29, 'group', 'D', '2026-06-19 19:00:00+00', 'USA',                'Australia',           null, null, 'Lumen Field, Seattle'),
-- Match 30 Jun 20 03:30 IST
(30, 'group', 'C', '2026-06-19 22:00:00+00', 'Scotland',           'Morocco',             null, null, 'Gillette Stadium, Boston'),
-- Match 31 Jun 20 06:30 IST
(31, 'group', 'C', '2026-06-20 01:00:00+00', 'Brazil',             'Haiti',               null, null, 'Lincoln Financial Field, Philadelphia'),
-- Match 32 Jun 20 09:30 IST
(32, 'group', 'D', '2026-06-20 04:00:00+00', 'Türkiye',            'Paraguay',            null, null, 'Levi''s Stadium, San Jose'),
-- Match 33 Jun 20 22:30 IST
(33, 'group', 'F', '2026-06-20 17:00:00+00', 'Netherlands',        'Sweden',              null, null, 'NRG Stadium, Houston'),
-- Match 34 Jun 21 01:30 IST
(34, 'group', 'E', '2026-06-20 20:00:00+00', 'Germany',            'Ivory Coast',         null, null, 'BMO Field, Toronto'),
-- Match 35 Jun 21 05:30 IST
(35, 'group', 'E', '2026-06-21 00:00:00+00', 'Ecuador',            'Curaçao',             null, null, 'Arrowhead Stadium, Kansas City'),
-- Match 36 Jun 21 09:30 IST
(36, 'group', 'F', '2026-06-21 04:00:00+00', 'Tunisia',            'Japan',               null, null, 'Estadio BBVA, Monterrey'),
-- Match 37 Jun 21 21:30 IST
(37, 'group', 'H', '2026-06-21 16:00:00+00', 'Spain',              'Saudi Arabia',        null, null, 'Mercedes-Benz Stadium, Atlanta'),
-- Match 38 Jun 22 00:30 IST
(38, 'group', 'G', '2026-06-21 19:00:00+00', 'Belgium',            'Iran',                null, null, 'SoFi Stadium, Los Angeles'),
-- Match 39 Jun 22 03:30 IST
(39, 'group', 'H', '2026-06-21 22:00:00+00', 'Uruguay',            'Cape Verde',          null, null, 'Hard Rock Stadium, Miami'),
-- Match 40 Jun 22 06:30 IST
(40, 'group', 'G', '2026-06-22 01:00:00+00', 'New Zealand',        'Egypt',               null, null, 'BC Place, Vancouver'),
-- Match 41 Jun 22 22:30 IST
(41, 'group', 'J', '2026-06-22 17:00:00+00', 'Argentina',          'Austria',             null, null, 'AT&T Stadium, Arlington'),
-- Match 42 Jun 23 02:30 IST
(42, 'group', 'I', '2026-06-22 21:00:00+00', 'France',             'Iraq',                null, null, 'Lincoln Financial Field, Philadelphia'),
-- Match 43 Jun 23 05:30 IST
(43, 'group', 'I', '2026-06-23 00:00:00+00', 'Norway',             'Senegal',             null, null, 'MetLife Stadium, East Rutherford'),
-- Match 44 Jun 23 08:30 IST
(44, 'group', 'J', '2026-06-23 03:00:00+00', 'Jordan',             'Algeria',             null, null, 'Levi''s Stadium, San Jose'),
-- Match 45 Jun 23 22:30 IST
(45, 'group', 'K', '2026-06-23 17:00:00+00', 'Portugal',           'Uzbekistan',          null, null, 'NRG Stadium, Houston'),
-- Match 46 Jun 24 01:30 IST
(46, 'group', 'L', '2026-06-23 20:00:00+00', 'England',            'Ghana',               null, null, 'Gillette Stadium, Boston'),
-- Match 47 Jun 24 04:30 IST
(47, 'group', 'L', '2026-06-23 23:00:00+00', 'Panama',             'Croatia',             null, null, 'BMO Field, Toronto'),
-- Match 48 Jun 24 07:30 IST
(48, 'group', 'K', '2026-06-24 02:00:00+00', 'Colombia',           'Congo DR',            null, null, 'Estadio Akron, Guadalajara'),

-- Matchday 3 (simultaneous within each group)
-- Match 49+50 Jun 25 00:30 IST (Group B)
(49, 'group', 'B', '2026-06-24 19:00:00+00', 'Switzerland',        'Canada',              null, null, 'BC Place, Vancouver'),
(50, 'group', 'B', '2026-06-24 19:00:00+00', 'Bosnia-Herzegovina', 'Qatar',               null, null, 'Lumen Field, Seattle'),
-- Match 51+52 Jun 25 03:30 IST (Group C)
(51, 'group', 'C', '2026-06-24 22:00:00+00', 'Scotland',           'Brazil',              null, null, 'Hard Rock Stadium, Miami'),
(52, 'group', 'C', '2026-06-24 22:00:00+00', 'Morocco',            'Haiti',               null, null, 'Mercedes-Benz Stadium, Atlanta'),
-- Match 53+54 Jun 25 06:30 IST (Group A)
(53, 'group', 'A', '2026-06-25 01:00:00+00', 'Czechia',            'Mexico',              null, null, 'Estadio Azteca, Mexico City'),
(54, 'group', 'A', '2026-06-25 01:00:00+00', 'South Africa',       'South Korea',         null, null, 'Estadio BBVA, Monterrey'),
-- Match 55+56 Jun 26 01:30 IST (Group E)
(55, 'group', 'E', '2026-06-25 20:00:00+00', 'Ecuador',            'Germany',             null, null, 'MetLife Stadium, East Rutherford'),
(56, 'group', 'E', '2026-06-25 20:00:00+00', 'Curaçao',            'Ivory Coast',         null, null, 'Lincoln Financial Field, Philadelphia'),
-- Match 57+58 Jun 26 04:30 IST (Group F)
(57, 'group', 'F', '2026-06-25 23:00:00+00', 'Japan',              'Sweden',              null, null, 'AT&T Stadium, Arlington'),
(58, 'group', 'F', '2026-06-25 23:00:00+00', 'Tunisia',            'Netherlands',         null, null, 'Arrowhead Stadium, Kansas City'),
-- Match 59+60 Jun 26 07:30 IST (Group D)
(59, 'group', 'D', '2026-06-26 02:00:00+00', 'Türkiye',            'USA',                 null, null, 'SoFi Stadium, Los Angeles'),
(60, 'group', 'D', '2026-06-26 02:00:00+00', 'Paraguay',           'Australia',           null, null, 'Levi''s Stadium, San Jose'),
-- Match 61+62 Jun 27 00:30 IST (Group I)
(61, 'group', 'I', '2026-06-26 19:00:00+00', 'Norway',             'France',              null, null, 'Gillette Stadium, Boston'),
(62, 'group', 'I', '2026-06-26 19:00:00+00', 'Senegal',            'Iraq',                null, null, 'BMO Field, Toronto'),
-- Match 63+64 Jun 27 05:30 IST (Group H)
(63, 'group', 'H', '2026-06-27 00:00:00+00', 'Cape Verde',         'Saudi Arabia',        null, null, 'NRG Stadium, Houston'),
(64, 'group', 'H', '2026-06-27 00:00:00+00', 'Uruguay',            'Spain',               null, null, 'Estadio Akron, Guadalajara'),
-- Match 65+66 Jun 27 08:30 IST (Group G)
(65, 'group', 'G', '2026-06-27 03:00:00+00', 'Egypt',              'Iran',                null, null, 'Lumen Field, Seattle'),
(66, 'group', 'G', '2026-06-27 03:00:00+00', 'New Zealand',        'Belgium',             null, null, 'BC Place, Vancouver'),
-- Match 67+68 Jun 28 02:30 IST (Group L)
(67, 'group', 'L', '2026-06-27 21:00:00+00', 'Panama',             'England',             null, null, 'MetLife Stadium, East Rutherford'),
(68, 'group', 'L', '2026-06-27 21:00:00+00', 'Croatia',            'Ghana',               null, null, 'Lincoln Financial Field, Philadelphia'),
-- Match 69+70 Jun 28 05:00 IST (Group K)
(69, 'group', 'K', '2026-06-27 23:30:00+00', 'Colombia',           'Portugal',            null, null, 'Hard Rock Stadium, Miami'),
(70, 'group', 'K', '2026-06-27 23:30:00+00', 'Congo DR',           'Uzbekistan',          null, null, 'Mercedes-Benz Stadium, Atlanta'),
-- Match 71+72 Jun 28 07:30 IST (Group J)
(71, 'group', 'J', '2026-06-28 02:00:00+00', 'Algeria',            'Austria',             null, null, 'Arrowhead Stadium, Kansas City'),
(72, 'group', 'J', '2026-06-28 02:00:00+00', 'Jordan',             'Argentina',           null, null, 'AT&T Stadium, Arlington'),

-- ── ROUND OF 32 ──────────────────────────────────────────────
(73, 'r32',   null, '2026-06-28 17:00:00+00', null, null, 'Winner C',           'Runner-up F',             'NRG Stadium, Houston'),
(74, 'r32',   null, '2026-06-28 19:00:00+00', null, null, 'Runner-up A',        'Runner-up B',             'SoFi Stadium, Los Angeles'),
(75, 'r32',   null, '2026-06-28 20:30:00+00', null, null, 'Winner E',           'Best 3rd (A/B/C/D/F)',    'Gillette Stadium, Boston'),
(76, 'r32',   null, '2026-06-29 01:00:00+00', null, null, 'Winner F',           'Runner-up C',             'Estadio BBVA, Monterrey'),
(77, 'r32',   null, '2026-06-29 17:00:00+00', null, null, 'Runner-up E',        'Runner-up I',             'AT&T Stadium, Arlington'),
(78, 'r32',   null, '2026-06-29 21:00:00+00', null, null, 'Winner I',           'Best 3rd (C/D/F/G/H)',    'MetLife Stadium, East Rutherford'),
(79, 'r32',   null, '2026-06-30 01:00:00+00', null, null, 'Winner A',           'Best 3rd (C/E/F/H/I)',    'Estadio Azteca, Mexico City'),
(80, 'r32',   null, '2026-06-30 16:00:00+00', null, null, 'Winner L',           'Best 3rd (E/H/I/J/K)',    'Mercedes-Benz Stadium, Atlanta'),
(81, 'r32',   null, '2026-06-30 20:00:00+00', null, null, 'Winner G',           'Best 3rd (A/E/H/I/J)',    'Lumen Field, Seattle'),
(82, 'r32',   null, '2026-07-01 00:00:00+00', null, null, 'Winner D',           'Best 3rd (B/E/F/I/J)',    'Levi''s Stadium, San Jose'),
(83, 'r32',   null, '2026-07-01 19:00:00+00', null, null, 'Winner H',           'Runner-up J',             'SoFi Stadium, Los Angeles'),
(84, 'r32',   null, '2026-07-01 23:00:00+00', null, null, 'Runner-up K',        'Runner-up L',             'BMO Field, Toronto'),
(85, 'r32',   null, '2026-07-02 03:00:00+00', null, null, 'Winner B',           'Best 3rd (E/F/G/I/J)',    'BC Place, Vancouver'),
(86, 'r32',   null, '2026-07-02 18:00:00+00', null, null, 'Runner-up D',        'Runner-up G',             'AT&T Stadium, Arlington'),
(87, 'r32',   null, '2026-07-02 22:00:00+00', null, null, 'Winner J',           'Runner-up H',             'Hard Rock Stadium, Miami'),
(88, 'r32',   null, '2026-07-03 01:30:00+00', null, null, 'Winner K',           'Best 3rd (D/E/I/J/L)',    'Arrowhead Stadium, Kansas City'),

-- ── ROUND OF 16 ──────────────────────────────────────────────
(89, 'r16',   null, '2026-07-04 17:00:00+00', null, null, 'Winner M74',         'Winner M77',              'NRG Stadium, Houston'),
(90, 'r16',   null, '2026-07-04 21:00:00+00', null, null, 'Winner M76',         'Winner M78',              'Lincoln Financial Field, Philadelphia'),
(91, 'r16',   null, '2026-07-05 20:00:00+00', null, null, 'Winner M73',         'Winner M75',              'MetLife Stadium, East Rutherford'),
(92, 'r16',   null, '2026-07-06 00:00:00+00', null, null, 'Winner M79',         'Winner M80',              'Estadio Azteca, Mexico City'),
(93, 'r16',   null, '2026-07-06 19:00:00+00', null, null, 'Winner M83',         'Winner M84',              'AT&T Stadium, Arlington'),
(94, 'r16',   null, '2026-07-06 21:00:00+00', null, null, 'Winner M81',         'Winner M82',              'Lumen Field, Seattle'),
(95, 'r16',   null, '2026-07-07 16:00:00+00', null, null, 'Winner M86',         'Winner M88',              'Mercedes-Benz Stadium, Atlanta'),
(96, 'r16',   null, '2026-07-07 20:00:00+00', null, null, 'Winner M85',         'Winner M87',              'BC Place, Vancouver'),

-- ── QUARTERFINALS ────────────────────────────────────────────
(97, 'qf',    null, '2026-07-09 20:00:00+00', null, null, 'Winner M89',         'Winner M90',              'Gillette Stadium, Boston'),
(98, 'qf',    null, '2026-07-10 19:00:00+00', null, null, 'Winner M93',         'Winner M94',              'SoFi Stadium, Los Angeles'),
(99, 'qf',    null, '2026-07-11 21:00:00+00', null, null, 'Winner M91',         'Winner M92',              'Hard Rock Stadium, Miami'),
(100,'qf',    null, '2026-07-12 01:00:00+00', null, null, 'Winner M95',         'Winner M96',              'Arrowhead Stadium, Kansas City'),

-- ── SEMIFINALS ───────────────────────────────────────────────
(101,'sf',    null, '2026-07-14 19:00:00+00', null, null, 'Winner M97',         'Winner M98',              'AT&T Stadium, Arlington'),
(102,'sf',    null, '2026-07-15 19:00:00+00', null, null, 'Winner M99',         'Winner M100',             'Mercedes-Benz Stadium, Atlanta'),

-- ── THIRD PLACE ──────────────────────────────────────────────
(103,'third', null, '2026-07-18 21:00:00+00', null, null, 'Loser M101',         'Loser M102',              'Hard Rock Stadium, Miami'),

-- ── FINAL ────────────────────────────────────────────────────
-- Jul 20 00:30 IST
(104,'final', null, '2026-07-19 19:00:00+00', null, null, 'Winner M101',        'Winner M102',             'MetLife Stadium, East Rutherford');
