const ACTIVITY_COLUMNS = {
  Football: ['Player Name', 'Position', 'Department', 'Student Registration Number', 'Player best foot'],
  Rugby: ['Player Name', 'Position', 'Year of Study', 'Department'],
  Handball: ['Player Name', 'Position', 'Year of Study', 'Department'],
  Softball: ['Player Name', 'Position', 'Year of Study', 'Department'],
  Hockey: ['Player Name', 'Position', 'Year of Study', 'Department'],
  Drama: ['Actor Name', 'Role', 'Year of Study', 'Department'],
  Volleyball: ['Player Name', 'Position', 'Year of Study', 'Department'],
  Music: ['Member Name', 'Instrument', 'Year of Study', 'Department'],
  AmericanBall: ['Player Name', 'Position', 'Year of Study', 'Department'],
};

const supabaseClient = window.supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.anonKey,
);
const activityMenu = document.getElementById('activityMenu');
const activityDetail = document.getElementById('activityDetail');
const matchModal = document.getElementById('matchModal');
const activityContent = document.getElementById('activityContent');
const matchContainer = document.getElementById('matchContainer');
const state = { activity: null, teams: [], fixtures: [], stadiums: [], referees: [], currentExport: null, refreshing: false };

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function showToast(message, duration = 3000) {
  document.querySelector('.toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), duration);
}

function setConnectionStatus(message, isError = false) {
  const element = document.getElementById('connectionStatus');
  element.textContent = message;
  element.classList.toggle('error-text', isError);
}

function updateTimeLabel() {
  const hour = new Date().getHours();
  const greeting = hour >= 5 && hour < 12 ? 'Morning'
    : hour >= 12 && hour < 17 ? 'Afternoon'
      : hour >= 17 && hour < 21 ? 'Evening' : 'Night';
  document.getElementById('timeDisplay').textContent = `Good ${greeting}!`;
}

function normalizeGroupName(value) {
  return String(value ?? '').trim().replace(/^group\s+/i, '').trim();
}

function openMenu(menu) {
  menu.classList.remove('hidden');
}

function closeMenu(menu) {
  menu.classList.add('hidden');
}

async function loadTeams() {
  const { data, error } = await supabaseClient
    .from('teams')
    .select('id, activity, team_name, gender, coach, group_name, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  state.teams = data;
}

async function loadFootballFixtures() {
  const { data, error } = await supabaseClient
    .from('football_fixtures')
    .select('id, gender, group_name, match_round, home_team_id, away_team_id, match_date, match_time, stadium_id, referee_id, match_status, home_score, away_score, scorers, assists')
    .order('gender')
    .order('group_name')
    .order('created_at');
  if (error) throw error;
  state.fixtures = data;
}

async function loadStadiums() {
  const { data, error } = await supabaseClient.from('stadiums').select('id, name');
  if (error) throw error;
  state.stadiums = data;
}

async function loadReferees() {
  const { data, error } = await supabaseClient.from('referees').select('id, name');
  if (error) throw error;
  state.referees = data;
}

function formatMatchTime(value) {
  return /^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value || '') ? value.slice(0, 5) : '—';
}

function fixtureDisplayGroup(fixture) {
  return normalizeGroupName(fixture?.group_name) || 'Knockout';
}

function groupStandings() {
  const groups = new Map();
  state.teams.filter(team => team.activity === 'Football' && team.group_name?.trim()).forEach(team => {
    const groupName = normalizeGroupName(team.group_name);
    const key = `${team.gender}|${groupName.toUpperCase()}`;
    if (!groups.has(key)) groups.set(key, { gender: team.gender, group: groupName, teams: new Map() });
    groups.get(key).teams.set(team.id, {
      id: team.id, name: team.team_name, played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, points: 0,
    });
  });

  state.fixtures.filter(fixture => fixture.match_status === 'played'
      && Number.isInteger(fixture.home_score) && Number.isInteger(fixture.away_score))
    .forEach(fixture => {
      const groupName = normalizeGroupName(fixture.group_name);
      const key = `${fixture.gender}|${groupName.toUpperCase()}`;
      const group = groups.get(key);
      const home = group?.teams.get(fixture.home_team_id);
      const away = group?.teams.get(fixture.away_team_id);
      if (!home || !away) return;
      home.played += 1;
      away.played += 1;
      home.goalsFor += fixture.home_score;
      home.goalsAgainst += fixture.away_score;
      away.goalsFor += fixture.away_score;
      away.goalsAgainst += fixture.home_score;
      if (fixture.home_score > fixture.away_score) {
        home.won += 1; home.points += 3; away.lost += 1;
      } else if (fixture.home_score < fixture.away_score) {
        away.won += 1; away.points += 3; home.lost += 1;
      } else {
        home.drawn += 1; away.drawn += 1; home.points += 1; away.points += 1;
      }
    });

  return [...groups.values()].map(group => {
    const teams = [...group.teams.values()].sort((a, b) =>
      b.points - a.points
      || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)
      || b.goalsFor - a.goalsFor
      || a.name.localeCompare(b.name));
    return {
      ...group,
      teams: teams.map((team, index) => ({
        ...team,
        position: index + 1,
        qualifies: index < 2,
      })),
    };
  }).sort((a, b) => a.gender.localeCompare(b.gender) || a.group.localeCompare(b.group));
}

function renderStandings() {
  const container = document.getElementById('standingsContainer');
  const groups = groupStandings();
  if (!groups.length) {
    container.innerHTML = '<p class="empty-state">No football teams have been registered in a group yet.</p>';
    return;
  }
  container.innerHTML = `<div class="group-cards-grid">${groups.map(group => `
    <section class="standing-group">
      <h3>${escapeHtml(group.gender)} — Group ${escapeHtml(group.group)}</h3>
      <p class="privacy-note">Standings are calculated from played group fixtures. The top 2 teams in each group qualify for the knockout stages.</p>
      <div class="table-wrap"><table class="match-table standings-table">
        <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th><th>Knockout</th></tr></thead>
        <tbody>${group.teams.map((team, index) => `
          <tr><td>${index + 1}</td><td>${escapeHtml(team.name)}</td><td>${team.played}</td>
            <td>${team.won}</td><td>${team.drawn}</td><td>${team.lost}</td>
            <td>${team.goalsFor}</td><td>${team.goalsAgainst}</td><td>${team.goalsFor - team.goalsAgainst}</td><td><strong>${team.points}</strong></td>
            <td>${team.qualifies ? '<strong>Q</strong>' : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </section>
  `).join('')}</div>`;
}

function normalizePlayerLookupKey(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function validFixtureScorers(fixture, side) {
  const records = fixture.scorers?.[side];
  const score = fixture[`${side}_score`];
  if (!Array.isArray(records) || !Number.isInteger(score) || score < 0) {
    return { records: [], valid: false };
  }

  const teamId = String(fixture[`${side}_team_id`]);
  const teamRecords = records.filter(record => record
    && String(record.team_id ?? teamId) === teamId
    && record.own_goal !== true
    && typeof record.player === 'string'
    && record.player.trim()
    && Number.isInteger(Number(record.goals))
    && Number(record.goals) > 0);
  const total = teamRecords.reduce((sum, record) => sum + Number(record.goals), 0);

  return { records: total <= score ? teamRecords : [], valid: total <= score };
}

function scorerRankings() {
  const players = new Map();
  const teamsById = new Map(state.teams.map(team => [team.id, team]));
  let invalidFixtureSides = 0;
  state.fixtures.filter(fixture => fixture.match_status === 'played').forEach(fixture => {
    ['home', 'away'].forEach(side => {
      const fixtureRecords = validFixtureScorers(fixture, side);
      if (!fixtureRecords.valid) {
        invalidFixtureSides += 1;
        return;
      }
      const teamId = String(fixture[`${side}_team_id`]);
      const teamName = teamsById.get(teamId)?.team_name || 'Team unavailable';
      fixtureRecords.records.forEach(record => {
        const goals = Number(record?.goals);
        const playerName = record.player.trim();
        const playerKey = `team:${teamId}|name:${normalizePlayerLookupKey(playerName)}`;
        const current = players.get(playerKey) || {
          name: playerName,
          teamId,
          team: teamName,
          goals: 0,
        };
        current.goals += goals;
        players.set(playerKey, current);
      });
    });
  });

  return {
    players: [...players.values()].sort((a, b) =>
      b.goals - a.goals || a.name.localeCompare(b.name)),
    invalidFixtureSides,
  };
}

function renderScorerRankings() {
  const container = document.getElementById('scorerRankingsContainer');
  const { players, invalidFixtureSides } = scorerRankings();
  const warning = invalidFixtureSides
    ? `<p class="error-text">${invalidFixtureSides} team result(s) have scorer totals higher than the match score and were excluded. Review those results in the admin page.</p>`
    : '';
  if (!players.length) {
    container.innerHTML = `${warning}<p class="empty-state">No registered players have scored yet.</p>`;
    return;
  }
  container.innerHTML = `${warning}<div class="table-wrap"><table class="match-table standings-table">
    <thead><tr><th>Player</th><th>Team</th><th>Goals</th></tr></thead>
    <tbody>${players.map(player => `<tr>
      <td>${escapeHtml(player.name)}</td><td>${escapeHtml(player.team)}</td><td><strong>${player.goals}</strong></td>
    </tr>`).join('')}</tbody></table></div>`;
}

function assistRankings() {
  const players = new Map();
  const teamsById = new Map(state.teams.map(team => [team.id, team]));
  state.fixtures.filter(fixture => fixture.match_status === 'played').forEach(fixture => {
    ['home', 'away'].forEach(side => {
      const records = fixture.assists?.[side];
      if (!Array.isArray(records)) return;
      const teamId = String(fixture[`${side}_team_id`]);
      const teamName = teamsById.get(teamId)?.team_name || 'Team unavailable';
      records.filter(record => record && typeof record.player === 'string' && record.player.trim()
          && Number.isInteger(record.assists) && record.assists > 0
          && String(record.team_id ?? teamId) === teamId)
        .forEach(record => {
          const playerName = String(record.player).trim();
          const playerKey = `team:${teamId}|name:${normalizePlayerLookupKey(playerName)}`;
          const current = players.get(playerKey) || {
            name: playerName,
            teamId,
            team: teamName,
            assists: 0,
          };
          current.assists += record.assists;
          players.set(playerKey, current);
        });
    });
  });

  return [...players.values()].sort((a, b) =>
    b.assists - a.assists || a.name.localeCompare(b.name));
}

function renderAssistRankings() {
  const container = document.getElementById('assistRankingsContainer');
  const players = assistRankings();
  if (!players.length) {
    container.innerHTML = '<p class="empty-state">No registered players have recorded assists yet.</p>';
    return;
  }
  container.innerHTML = `<div class="table-wrap"><table class="match-table standings-table">
    <thead><tr><th>Player</th><th>Team</th><th>Assists</th></tr></thead>
    <tbody>${players.map(player => `<tr>
      <td>${escapeHtml(player.name)}</td><td>${escapeHtml(player.team)}</td><td><strong>${player.assists}</strong></td>
    </tr>`).join('')}</tbody></table></div>`;
}

function renderPublicFixtures() {
  const container = document.getElementById('publicFixturesContainer');
  const teamsById = new Map(state.teams.map(team => [team.id, team]));
  const stadiumsById = new Map(state.stadiums.map(stadium => [stadium.id, stadium]));
  const refereesById = new Map(state.referees.map(referee => [referee.id, referee]));
  const fixturesByGroup = new Map();
  state.fixtures.forEach(fixture => {
    const groupName = fixtureDisplayGroup(fixture);
    const groupKey = `${fixture.gender}|${groupName.toUpperCase()}`;
    const fixtures = fixturesByGroup.get(groupKey) || [];
    fixtures.push(fixture);
    fixturesByGroup.set(groupKey, fixtures);
  });

  if (!fixturesByGroup.size) {
    container.innerHTML = '<p class="empty-state">No fixtures have been added yet. An administrator can create matchups after teams are registered.</p>';
    return;
  }

  container.innerHTML = `<div class="group-cards-grid">${[...fixturesByGroup.entries()].map(([key, fixtures]) => {
    const [gender] = key.split('|');
    const group = fixtureDisplayGroup(fixtures[0]);
    const heading = ['Quarter-finals', 'Semi-finals', 'Final'].includes(group)
      ? `${escapeHtml(gender)} — ${escapeHtml(group)}`
      : `${escapeHtml(gender)} — Group ${escapeHtml(group)}`;
    return `<section class="match-group-card">
      <h3>${heading}</h3>
      <div class="table-wrap"><table class="match-table">
        <thead><tr><th>Round</th><th>Home Team</th><th>Away Team</th><th>Date</th><th>Time (Africa/Nairobi)</th><th>Venue</th><th>Referee</th><th>Result / status</th></tr></thead>
        <tbody>${fixtures.sort((a, b) =>
    (a.match_date || '9999-99-99').localeCompare(b.match_date || '9999-99-99')
    || (a.match_time || '99:99').localeCompare(b.match_time || '99:99')
  ).map(fixture => {
          const homeName = teamsById.get(fixture.home_team_id)?.team_name || 'Team removed';
          const awayName = teamsById.get(fixture.away_team_id)?.team_name || 'Team removed';
          const stadiumName = stadiumsById.get(fixture.stadium_id)?.name || 'Not assigned';
          const refereeName = refereesById.get(fixture.referee_id)?.name || 'Not assigned';
          const result = fixture.match_status === 'played'
            ? `${fixture.home_score}–${fixture.away_score}`
            : fixture.match_status === 'postponed' ? 'Postponed' : 'Scheduled';
          return `<tr>
            <td>${escapeHtml(fixture.match_round || 1)}</td>
            <td>${escapeHtml(homeName)}</td>
            <td>${escapeHtml(awayName)}</td>
            <td>${escapeHtml(fixture.match_date || 'Not scheduled')}</td>
            <td>${escapeHtml(formatMatchTime(fixture.match_time))}</td>
            <td>${escapeHtml(stadiumName)}</td>
            <td>${escapeHtml(refereeName)}</td>
            <td>${escapeHtml(result)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </section>`;
  }).join('')}</div>`;
}

function scorerSummary(scorers, side, scoringTeamId, opposingTeamId) {
  const names = scorers?.[side];
  if (!Array.isArray(names) || !names.length) return '—';
  return names.map(record => {
    const expectedTeamId = record?.own_goal ? opposingTeamId : scoringTeamId;
    if (!record?.player || !record.participant_id || String(record.team_id) !== String(expectedTeamId)
        || !Number.isInteger(record.goals) || record.goals < 1) return '';
    return `${escapeHtml(record.player)}${record.own_goal ? ' (OG)' : ''}${record.goals > 1 ? ` ×${record.goals}` : ''}`;
  }).filter(Boolean).join(', ') || '—';
}

function teamListMarkup(activity) {
  const teams = state.teams.filter(team => team.activity === activity);
  if (!teams.length) return '<p class="empty-state">No teams registered yet.</p>';
  return `
    <details class="registered-teams">
      <summary>View saved registrations (${teams.length})</summary>
      <ul>${teams.map(team => `<li><strong>${escapeHtml(team.team_name)}</strong>${normalizeGroupName(team.group_name) ? ` — Group ${escapeHtml(normalizeGroupName(team.group_name))}` : ''}${team.gender ? ` — ${escapeHtml(team.gender)}` : ''}</li>`).join('')}</ul>
    </details>
  `;
}

function createActivityForm(activity) {
  const columns = ACTIVITY_COLUMNS[activity];
  const groupField = activity === 'Football'
    ? '<div class="field"><label for="groupName">Tournament Group:</label><input id="groupName" type="text" maxlength="80" placeholder="For example: A or Group 1" /></div>'
    : '';
  const genderField = !['Music', 'Drama'].includes(activity)
    ? '<div class="field"><label for="gender">Team Gender:</label><select id="gender"><option>Men</option><option>Women</option></select></div>'
    : '';
  const teamLabel = activity === 'Drama' ? 'Drama Name:' : 'Team Name:';

  return `
    <div class="activity-form">
      <h2>${escapeHtml(activity)} Registration</h2>
      ${teamListMarkup(activity)}
      <p class="privacy-note">Registrations are shared. Participant details are only visible to administrators.</p>
      <div class="form-row">
        ${groupField}
        <div class="field"><label for="teamName">${teamLabel}</label><input id="teamName" type="text" maxlength="120" required /></div>
        ${genderField}
        <div class="field"><label for="coachName">Team Coach:</label><input id="coachName" type="text" maxlength="120" /></div>
      </div>
      <div class="action-row">
        <div class="inline-buttons">
          <button type="button" id="addRowBtn" class="row-action">Add Participant</button>
          <button type="button" id="removeRowBtn" class="row-action">Remove Last Participant</button>
          ${activity === 'Football' ? '<button type="button" id="generateMatchesBtn" class="row-action">View Group Matches</button>' : ''}
        </div>
        <div class="inline-buttons">
          <button type="button" id="exportCsvBtn" class="secondary-btn">Save to Device</button>
          <button type="button" id="submitRegistrationBtn" class="primary-btn">Submit Registration</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="participants-table">
          <thead><tr>${columns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
          <tbody>${participantRowMarkup(columns)}</tbody>
        </table>
      </div>
      <p class="privacy-note">Tip: paste a copied list into a participant cell to fill rows, or paste tab-separated spreadsheet rows to fill multiple columns.</p>
    </div>`;
}

function participantRowMarkup(columns) {
  return `<tr>${columns.map((column, index) =>
    `<td><input type="text" aria-label="${escapeHtml(column)}" data-col="${index}" maxlength="160" /></td>`
  ).join('')}</tr>`;
}

function parseParticipantPaste(text) {
  const rows = text.replace(/\r\n?/g, '\n').split('\n');
  while (rows.length && rows[rows.length - 1] === '') rows.pop();
  return rows.map(row => row.split('\t'));
}

function pasteParticipantRows(event) {
  const text = event.clipboardData?.getData('text/plain');
  if (!text || (!text.includes('\n') && !text.includes('\t'))) return;

  const startRow = event.target.closest('tr');
  const tbody = startRow?.parentElement;
  const startColumn = Number(event.target.dataset.col);
  if (!tbody || !Number.isInteger(startColumn)) return;

  const pastedRows = parseParticipantPaste(text);
  if (!pastedRows.length) return;
  event.preventDefault();

  const columns = ACTIVITY_COLUMNS[state.activity];
  const startRowIndex = [...tbody.rows].indexOf(startRow);
  while (tbody.rows.length < startRowIndex + pastedRows.length) {
    tbody.insertAdjacentHTML('beforeend', participantRowMarkup(columns));
  }

  pastedRows.forEach((values, rowOffset) => {
    const inputs = tbody.rows[startRowIndex + rowOffset].querySelectorAll('input');
    values.forEach((value, columnOffset) => {
      const input = inputs[startColumn + columnOffset];
      if (input) input.value = value.trim();
    });
  });
}

function openActivityDetail(activity) {
  state.activity = activity;
  state.currentExport = null;
  activityContent.innerHTML = createActivityForm(activity);
  activityContent.querySelector('tbody').addEventListener('paste', pasteParticipantRows);
  document.getElementById('addRowBtn').addEventListener('click', () => {
    const tbody = activityContent.querySelector('tbody');
    tbody.insertAdjacentHTML('beforeend', participantRowMarkup(ACTIVITY_COLUMNS[activity]));
  });
  document.getElementById('removeRowBtn').addEventListener('click', () => {
    const rows = activityContent.querySelectorAll('tbody tr');
    if (rows.length > 1) rows[rows.length - 1].remove();
  });
  document.getElementById('submitRegistrationBtn').addEventListener('click', submitRegistration);
  document.getElementById('exportCsvBtn').addEventListener('click', exportRegistration);
  document.getElementById('generateMatchesBtn')?.addEventListener('click', openMatchModal);
  openMenu(activityDetail);
  loadTeams().then(() => {
    if (state.activity !== activity || activityDetail.classList.contains('hidden')) return;
    const currentList = activityContent.querySelector('.registered-teams, .empty-state');
    const refreshedList = document.createElement('div');
    refreshedList.innerHTML = teamListMarkup(activity);
    if (currentList) currentList.replaceWith(refreshedList.firstElementChild);
  }).catch(error => console.error('Could not refresh team list:', error));
}

function readForm() {
  const activity = state.activity;
  const columns = ACTIVITY_COLUMNS[activity];
  const participants = [...activityContent.querySelectorAll('tbody tr')].map(row => {
    const values = [...row.querySelectorAll('input')].map(input => input.value.trim());
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || '']));
  }).filter(participant => Object.values(participant).some(Boolean));

  return {
    activity,
    team_name: document.getElementById('teamName').value.trim(),
    gender: document.getElementById('gender')?.value || null,
    coach: document.getElementById('coachName').value.trim(),
    group_name: normalizeGroupName(document.getElementById('groupName')?.value),
    participants,
  };
}

function normalizeStudentRegistrationNumber(value) {
  return String(value || '').trim().toLowerCase();
}

async function submitRegistration() {
  const registration = readForm();
  if (!registration.team_name) {
    showToast('Please enter a team or activity name.');
    document.getElementById('teamName').focus();
    return;
  }
  if (registration.activity === 'Football') {
    const registrationNumbers = registration.participants
      .map(participant => normalizeStudentRegistrationNumber(participant['Student Registration Number']))
      .filter(Boolean);
    if (new Set(registrationNumbers).size !== registrationNumbers.length) {
      showToast('Each football player must have a unique student registration number.');
      return;
    }
  }
  const button = document.getElementById('submitRegistrationBtn');
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const { data, error } = await supabaseClient.rpc('register_team', {
      p_activity: registration.activity,
      p_team_name: registration.team_name,
      p_gender: registration.gender,
      p_coach: registration.coach,
      p_group_name: registration.group_name,
      p_participants: registration.participants,
    });
    if (error) throw error;
    await loadTeams();
    openActivityDetail(registration.activity);
    state.currentExport = registration;
    showToast('Team registration saved and shared.');
  } catch (error) {
    console.error('Could not save registration:', error);
    showToast(error.code === '23505'
      && error.message.includes('registration_participants_student_registration_number_unique')
      ? 'That student registration number is already registered on another football team.'
      : `Could not save registration: ${error.message}`);
    button.disabled = false;
    button.textContent = 'Submit Registration';
  }
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportRegistration() {
  const registration = state.currentExport || readForm();
  if (!registration.team_name) {
    showToast('Enter a team name before saving a CSV copy.');
    return;
  }
  const columns = ACTIVITY_COLUMNS[registration.activity];
  const rows = [
    ['Activity', 'Team Name', 'Gender', 'Group', 'Coach', ...columns],
    ...(registration.participants.length
      ? registration.participants.map(person => [
        registration.activity,
        registration.team_name,
        registration.gender || '',
        registration.group_name,
        registration.coach,
        ...columns.map(column => person[column] || ''),
      ])
      : [[registration.activity, registration.team_name, registration.gender || '', registration.group_name, registration.coach, ...columns.map(() => '')]]),
  ];
  const blob = new Blob([rows.map(row => row.map(csvEscape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${registration.team_name.replace(/[^a-zA-Z0-9 _-]/g, '_')}_${registration.activity.toLowerCase()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function openMatchModal() {
  matchContainer.innerHTML = '<p>Loading shared fixtures…</p>';
  openMenu(matchModal);
  try {
    await loadTeams();
    await loadFootballFixtures();
    await loadStadiums();
    await loadReferees();
    renderStandings();
    renderPublicFixtures();
    renderScorerRankings();
    renderAssistRankings();
    const teamsById = new Map(state.teams.map(team => [team.id, team]));
    const groups = new Map();
    state.fixtures.forEach(fixture => {
      const key = `${fixture.gender}|${normalizeGroupName(fixture.group_name).toUpperCase()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(fixture);
    });
    if (!groups.size) {
      matchContainer.innerHTML = '<p class="empty-state">No fixtures yet. Add at least two football teams in the same gender and group.</p>';
      return;
    }
    matchContainer.innerHTML = [...groups.entries()].map(([key, rows]) => {
      const [gender] = key.split('|');
      const group = normalizeGroupName(rows[0].group_name);
      return `<section class="match-group-card"><h3>${escapeHtml(gender)} — Group ${escapeHtml(group)}</h3>
        <table class="match-table"><thead><tr><th>Home Team</th><th>Away Team</th><th>Date</th><th>Result / status</th><th>Goalscorers</th></tr></thead><tbody>
        ${rows.map(fixture => {
          const score = fixture.match_status === 'played'
            ? `${fixture.home_score}–${fixture.away_score}`
            : fixture.match_status === 'postponed' ? 'Postponed' : 'Scheduled';
          const scorers = fixture.match_status === 'played'
            ? `${scorerSummary(fixture.scorers, 'home', fixture.home_team_id, fixture.away_team_id)} / ${scorerSummary(fixture.scorers, 'away', fixture.away_team_id, fixture.home_team_id)}` : '—';
          return `<tr><td>${escapeHtml(teamsById.get(fixture.home_team_id)?.team_name || 'Removed team')}</td>
            <td>${escapeHtml(teamsById.get(fixture.away_team_id)?.team_name || 'Removed team')}</td>
            <td>${escapeHtml(fixture.match_date || 'Not scheduled')}</td><td>${escapeHtml(score)}</td><td>${scorers}</td></tr>`;
        }).join('')}
        </tbody></table></section>`;
    }).join('');
  } catch (error) {
    console.error('Could not load fixtures:', error);
    matchContainer.innerHTML = `<p class="error-text">Could not load shared fixtures: ${escapeHtml(error.message)}</p>`;
  }
}

function bindUI() {
  document.querySelectorAll('.portal-btn').forEach(button => {
    button.addEventListener('click', () => window.open(button.dataset.url, '_blank', 'noopener,noreferrer'));
  });
  document.getElementById('openActivitiesBtn').addEventListener('click', () => openMenu(activityMenu));
  document.querySelectorAll('.activity-option').forEach(button => {
    button.addEventListener('click', () => {
      closeMenu(activityMenu);
      openActivityDetail(button.dataset.activity);
    });
  });
  document.getElementById('backToActivitiesBtn').addEventListener('click', () => {
    closeMenu(activityDetail);
    openMenu(activityMenu);
  });
  document.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => closeMenu(document.getElementById(button.dataset.close)));
  });
}

async function initialize() {
  updateTimeLabel();
  window.setInterval(updateTimeLabel, 60_000);
  bindUI();
  window.addEventListener('focus', refreshPublicData);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshPublicData();
  });
  if (!window.SUPABASE_CONFIG?.url || !window.SUPABASE_CONFIG?.anonKey
      || window.SUPABASE_CONFIG.url.includes('YOUR_PROJECT')
      || window.SUPABASE_CONFIG.anonKey.includes('YOUR_SUPABASE')) {
    setConnectionStatus('Set the Supabase project URL and publishable key in supabase-config.js.', true);
    return;
  }
  await refreshPublicData();
}

async function refreshPublicData() {
  if (!window.SUPABASE_CONFIG?.url || !window.SUPABASE_CONFIG?.anonKey
      || window.SUPABASE_CONFIG.url.includes('YOUR_PROJECT')
      || window.SUPABASE_CONFIG.anonKey.includes('YOUR_SUPABASE')) return;
  if (state.refreshing) return;
  state.refreshing = true;
  try {
    await loadTeams();
    await loadFootballFixtures();
    await loadStadiums();
    await loadReferees();
    renderStandings();
    renderPublicFixtures();
    renderScorerRankings();
    renderAssistRankings();
    setConnectionStatus('Connected — registrations and fixtures are shared.');
  } catch (error) {
    console.error('Could not connect to Supabase:', error);
    document.getElementById('standingsContainer').innerHTML =
      '<p class="error-text">Could not load football standings. Check the Supabase schema and connection.</p>';
    document.getElementById('publicFixturesContainer').innerHTML =
      '<p class="error-text">Could not load football fixtures. Check the Supabase schema and connection.</p>';
    document.getElementById('scorerRankingsContainer').innerHTML =
      '<p class="error-text">Could not load goalscorers. Check the Supabase schema and connection.</p>';
    document.getElementById('assistRankingsContainer').innerHTML =
      '<p class="error-text">Could not load assists. Check the Supabase schema and connection.</p>';
    setConnectionStatus(`Could not load shared registrations: ${error.message}`, true);
  } finally {
    state.refreshing = false;
  }
}

initialize();
