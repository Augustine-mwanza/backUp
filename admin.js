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

let supabaseClient;
let adminTeams = [];
const loginPanel = document.getElementById('loginPanel');
const dashboard = document.getElementById('dashboard');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function setLoginMessage(message, isError = false) {
  const element = document.getElementById('loginMessage');
  element.textContent = message;
  element.classList.toggle('error-text', isError);
}

async function verifyAdmin(user) {
  const { data, error } = await supabaseClient.rpc('is_app_admin');
  if (error) throw error;
  if (!data) {
    await supabaseClient.auth.signOut();
    throw new Error('This account is not authorized as an administrator.');
  }
  document.getElementById('signedInAs').textContent = user.email || 'Signed in';
  await refreshDashboard();
  loginPanel.classList.add('hidden');
  dashboard.classList.remove('hidden');
}

async function refreshDashboard() {
  const [teamsResult, participantsResult, fixturesResult, stadiumsResult, refereesResult] = await Promise.all([
    supabaseClient.from('teams').select('id, activity, team_name, gender, coach, group_name, created_at').order('created_at', { ascending: false }),
    supabaseClient.from('registration_participants').select('id, team_id, details'),
    supabaseClient.from('football_fixtures').select('id, gender, group_name, match_round, home_team_id, away_team_id, match_date, match_time, stadium_id, referee_id, match_status, home_score, away_score, scorers, assists').order('gender').order('group_name').order('match_round'),
    supabaseClient.from('stadiums').select('id, name').order('name'),
    supabaseClient.from('referees').select('id, name').order('name'),
  ]);
  const error = teamsResult.error || participantsResult.error || fixturesResult.error || stadiumsResult.error || refereesResult.error;
  if (error) throw error;

  const teams = teamsResult.data;
  adminTeams = teams;
  const teamsById = new Map(teams.map(team => [team.id, team]));
  const stadiums = stadiumsResult.data;
  const referees = refereesResult.data;
  const participantsByTeam = new Map();
  participantsResult.data.forEach(row => {
    const list = participantsByTeam.get(row.team_id) || [];
    list.push(row);
    participantsByTeam.set(row.team_id, list);
  });

  document.getElementById('adminTeams').innerHTML = teams.length ? `
    <table class="admin-table"><thead><tr><th>Activity</th><th>Team / Name</th><th>Gender / Group</th><th>Coach</th><th>Participants</th><th>Action</th></tr></thead>
      <tbody>${teams.map(team => {
        const people = participantsByTeam.get(team.id) || [];
        return `<tr>
          <td>${escapeHtml(team.activity)}</td>
          <td>${escapeHtml(team.team_name)}</td>
          <td>${escapeHtml([team.gender, team.group_name ? `Group ${team.group_name}` : ''].filter(Boolean).join(' / '))}</td>
          <td>${escapeHtml(team.coach)}</td>
          <td>${people.length ? `<details><summary>${people.length} participant(s)</summary><pre>${escapeHtml(JSON.stringify(people, null, 2))}</pre></details>` : '—'}</td>
          <td class="table-actions">
            <button class="secondary-btn" data-edit-team="${team.id}">Edit</button>
            <button class="danger-btn" data-delete-team="${team.id}">Remove team</button>
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table>
  ` : '<p class="empty-state">No teams are registered.</p>';

  document.getElementById('adminStadiums').innerHTML = stadiums.length ? `
    <table class="admin-table"><thead><tr><th>Stadium</th><th>Action</th></tr></thead>
      <tbody>${stadiums.map(stadium => `<tr>
        <td>${escapeHtml(stadium.name)}</td>
        <td class="table-actions"><button class="danger-btn" data-delete-stadium="${stadium.id}">Remove stadium</button></td>
      </tr>`).join('')}</tbody>
    </table>
  ` : '<p class="empty-state">No stadiums have been added yet. Add one above to assign it to a fixture.</p>';

  document.getElementById('adminReferees').innerHTML = referees.length ? `
    <table class="admin-table"><thead><tr><th>Referee</th><th>Action</th></tr></thead>
      <tbody>${referees.map(referee => `<tr>
        <td>${escapeHtml(referee.name)}</td>
        <td class="table-actions"><button class="danger-btn" data-delete-referee="${referee.id}">Remove referee</button></td>
      </tr>`).join('')}</tbody>
    </table>
  ` : '<p class="empty-state">No referees have been added yet.</p>';

  populateFixtureGroupOptions(teams);
  populateGenerateFixturesGroups(teams);
  const fixtures = fixturesResult.data;
  const fixtureRows = fixtures.map(fixture => {
    const homeName = teamsById.get(fixture.home_team_id)?.team_name || 'Team removed';
    const awayName = teamsById.get(fixture.away_team_id)?.team_name || 'Team removed';
    const due = matchDateReached(fixture.match_date);
    const canEditResult = fixture.match_status === 'played'
      || (fixture.match_status === 'scheduled' && due);
    const scorerData = fixture.scorers || { home: [], away: [] };
    const homeScorers = Array.isArray(scorerData.home) ? scorerData.home : [];
    const awayScorers = Array.isArray(scorerData.away) ? scorerData.away : [];
    const assistData = fixture.assists || { home: [], away: [] };
    const homeAssists = Array.isArray(assistData.home) ? assistData.home : [];
    const awayAssists = Array.isArray(assistData.away) ? assistData.away : [];
    const homePlayers = registeredFootballPlayers(participantsByTeam.get(fixture.home_team_id) || []);
    const awayPlayers = registeredFootballPlayers(participantsByTeam.get(fixture.away_team_id) || []);
    return `
      <tr>
        <td class="fixture-group-round-cell">
          <span>${escapeHtml(`${fixture.gender} — ${fixture.group_name}`)}</span>
          <span class="fixture-round-label">Round ${escapeHtml(fixture.match_round)}</span>
        </td>
        <td>${escapeHtml(homeName)} vs ${escapeHtml(awayName)}</td>
        <td class="fixture-schedule-cell">
          <label>Date<input class="date-input" type="date" value="${escapeHtml(validMatchDate(fixture.match_date))}" data-fixture-date="${fixture.id}" ${fixture.match_status === 'played' ? 'disabled' : ''} /></label>
          <label>Time (Africa/Nairobi)<input class="time-input" type="time" value="${escapeHtml(validMatchTime(fixture.match_time))}" data-fixture-time="${fixture.id}" ${fixture.match_status === 'played' ? 'disabled' : ''} /></label>
          <label>Stadium<select data-fixture-stadium="${fixture.id}" ${fixture.match_status === 'played' ? 'disabled' : ''}>
            <option value="">Select stadium</option>
            ${stadiums.map(stadium => `<option value="${escapeHtml(stadium.id)}" ${stadium.id === fixture.stadium_id ? 'selected' : ''}>${escapeHtml(stadium.name)}</option>`).join('')}
          </select></label>
          <label>Referee<select data-fixture-referee="${fixture.id}" ${fixture.match_status === 'played' ? 'disabled' : ''}>
            <option value="">Select referee</option>
            ${referees.map(referee => `<option value="${escapeHtml(referee.id)}" ${referee.id === fixture.referee_id ? 'selected' : ''}>${escapeHtml(referee.name)}</option>`).join('')}
          </select></label>
          ${fixture.match_status !== 'played' ? `<button class="secondary-btn save-date-btn" data-save-schedule="${fixture.id}">Save schedule</button>` : ''}
        </td>
        <td>
          <span class="match-status">${escapeHtml(fixture.match_status || 'scheduled')}</span>
          ${canEditResult ? `<div class="score-inputs">
            <label>${escapeHtml(homeName)}<input type="number" min="0" step="1" value="${fixture.home_score ?? ''}" data-home-score="${fixture.id}" aria-label="${escapeHtml(homeName)} goals" /></label>
            <label>${escapeHtml(awayName)}<input type="number" min="0" step="1" value="${fixture.away_score ?? ''}" data-away-score="${fixture.id}" aria-label="${escapeHtml(awayName)} goals" /></label>
          </div>` : fixture.match_status === 'postponed' ? '<p>Awaiting a new match date.</p>' : '<p>Result entry opens on the match date.</p>'}
          ${canEditResult ? `<div class="result-player-details">
            ${scorerEditorMarkup(fixture.id, 'home', homeName, awayName, homePlayers, awayPlayers, homeScorers)}
            ${scorerEditorMarkup(fixture.id, 'away', awayName, homeName, awayPlayers, homePlayers, awayScorers)}
            ${assistEditorMarkup(fixture.id, 'home', homeName, homePlayers, homeAssists)}
            ${assistEditorMarkup(fixture.id, 'away', awayName, awayPlayers, awayAssists)}
          </div>` : ''}
        </td>
        <td class="table-actions">
          ${canEditResult ? `<button class="primary-btn save-result-btn" data-save-result="${fixture.id}">Save result</button>` : ''}
          ${fixture.match_status === 'postponed'
            ? `<button class="secondary-btn schedule-match-btn" data-schedule-match="${fixture.id}">Mark scheduled</button>`
            : (due && fixture.match_status !== 'played' ? `<button class="secondary-btn postpone-match-btn" data-postpone-match="${fixture.id}">Mark postponed</button>` : '')}
          ${fixture.match_status !== 'played' ? `<button class="danger-btn" data-delete-fixture="${fixture.id}">Remove fixture</button>` : ''}
        </td>
      </tr>`;
  }).join('');
  document.getElementById('adminFixtures').innerHTML = fixtures.length ? `
    <table class="admin-table"><thead><tr><th>Group / round</th><th>Teams</th><th>Schedule</th><th>Status / result</th><th>Actions</th></tr></thead>
      <tbody>${fixtureRows}</tbody>
    </table>
  ` : '<p class="empty-state">No fixtures yet. Choose a group and two teams above to create the first matchup.</p>';

  document.querySelectorAll('[data-delete-stadium]').forEach(button => {
    button.addEventListener('click', () => removeStadium(button.dataset.deleteStadium));
  });
  document.querySelectorAll('[data-delete-referee]').forEach(button => {
    button.addEventListener('click', () => removeReferee(button.dataset.deleteReferee));
  });
  document.querySelectorAll('[data-edit-team]').forEach(button => {
    button.addEventListener('click', () => {
      const team = teams.find(item => item.id === button.dataset.editTeam);
      if (!team) return;
      const people = participantsByTeam.get(team.id) || [];
      openTeamEditDialog(team, people, participantsByTeam, teamsById);
    });
  });
  document.querySelectorAll('[data-delete-team]').forEach(button => {
    button.addEventListener('click', () => removeTeam(button.dataset.deleteTeam, button));
  });
  document.querySelectorAll('[data-delete-fixture]').forEach(button => {
    button.addEventListener('click', () => removeFixture(button.dataset.deleteFixture, button));
  });
  document.querySelectorAll('[data-save-schedule]').forEach(button => {
    button.addEventListener('click', () => saveFixtureSchedule(button.dataset.saveSchedule, button));
  });
  document.querySelectorAll('[data-save-result]').forEach(button => {
    button.addEventListener('click', () => saveFixtureResult(button.dataset.saveResult, button));
  });
  document.querySelectorAll('[data-postpone-match]').forEach(button => {
    button.addEventListener('click', () => setFixtureStatus(button.dataset.postponeMatch, 'postponed', button));
  });
  document.querySelectorAll('[data-schedule-match]').forEach(button => {
    button.addEventListener('click', () => setFixtureStatus(button.dataset.scheduleMatch, 'scheduled', button));
  });
  document.querySelectorAll('[data-add-scorer]').forEach(button => {
    button.addEventListener('click', () => addScorerRow(button));
  });
  document.querySelectorAll('[data-add-assist]').forEach(button => {
    button.addEventListener('click', () => addAssistRow(button));
  });
  document.querySelectorAll('.remove-scorer-btn').forEach(button => {
    button.addEventListener('click', () => button.closest('.scorer-row').remove());
  });
  document.querySelectorAll('.remove-assist-btn').forEach(button => {
    button.addEventListener('click', () => button.closest('.assist-row').remove());
  });
}

function participantEditorRow(columns, details = {}) {
  return `<tr>${columns.map(column => `<td><input type="text" value="${escapeHtml(details[column] ?? '')}" aria-label="${escapeHtml(column)}" /></td>`).join('')}</tr>`;
}

function openTeamEditDialog(team, people, participantsByTeam, teamsById) {
  const columns = ACTIVITY_COLUMNS[team.activity] || [];
  const modal = document.createElement('div');
  modal.className = 'edit-modal-backdrop';
  const rows = people.length ? people.map(person => participantEditorRow(columns, person.details || {})) : [participantEditorRow(columns)];
  modal.innerHTML = `
    <div class="edit-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="editTeamTitle">
      <div class="edit-modal-header">
        <h3 id="editTeamTitle">Edit ${escapeHtml(team.activity)} registration</h3>
        <button type="button" class="secondary-btn" data-close-edit>Close</button>
      </div>
      <div class="edit-modal-form">
        <div class="edit-modal-grid">
          <label>
            Team name
            <input type="text" value="${escapeHtml(team.team_name)}" data-edit-team-name />
          </label>
          <label>
            Team coach
            <input type="text" value="${escapeHtml(team.coach)}" data-edit-coach />
          </label>
          ${team.activity === 'Football' ? `
            <label>
              Team gender
              <select data-edit-gender>
                <option value="Men" ${team.gender === 'Men' ? 'selected' : ''}>Men</option>
                <option value="Women" ${team.gender === 'Women' ? 'selected' : ''}>Women</option>
              </select>
            </label>
            <label>
              Group name
              <input type="text" value="${escapeHtml(team.group_name)}" data-edit-group-name />
            </label>
          ` : `
            <label>
              Team gender
              <select data-edit-gender>
                <option value="" ${!team.gender ? 'selected' : ''}>N/A</option>
                <option value="Men" ${team.gender === 'Men' ? 'selected' : ''}>Men</option>
                <option value="Women" ${team.gender === 'Women' ? 'selected' : ''}>Women</option>
              </select>
            </label>
            <label>
              Group name
              <input type="text" value="${escapeHtml(team.group_name)}" data-edit-group-name />
            </label>
          `}
        </div>
        <div class="edit-participants-toolbar">
          <button type="button" class="secondary-btn" data-add-edit-row>Add participant</button>
          <button type="button" class="secondary-btn" data-remove-edit-row>Remove last participant</button>
        </div>
        <div class="edit-participants-wrap">
          <table class="admin-table edit-participants-table">
            <thead><tr>${columns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
            <tbody>${rows.join('')}</tbody>
          </table>
        </div>
      </div>
      <div class="edit-modal-actions">
        <button type="button" class="secondary-btn" data-close-edit>Cancel</button>
        <button type="button" class="primary-btn" data-save-edit>Save changes</button>
      </div>
    </div>
  `;

  const tableBody = modal.querySelector('tbody');
  modal.querySelector('[data-add-edit-row]').addEventListener('click', () => {
    tableBody.insertAdjacentHTML('beforeend', participantEditorRow(columns));
  });
  modal.querySelector('[data-remove-edit-row]').addEventListener('click', () => {
    const rows = tableBody.querySelectorAll('tr');
    if (rows.length > 0) rows[rows.length - 1].remove();
  });
  modal.querySelectorAll('[data-close-edit]').forEach(button => {
    button.addEventListener('click', () => modal.remove());
  });
  modal.querySelector('[data-save-edit]').addEventListener('click', async () => {
    const teamName = modal.querySelector('[data-edit-team-name]').value.trim();
    const coach = modal.querySelector('[data-edit-coach]').value.trim();
    const genderValue = modal.querySelector('[data-edit-gender]').value;
    const groupValue = modal.querySelector('[data-edit-group-name]').value.trim();
    if (!teamName) {
      setDashboardMessage('Enter a team name before saving changes.', true);
      return;
    }

    const updatedParticipants = [];
    for (const row of tableBody.querySelectorAll('tr')) {
      const values = row.querySelectorAll('input');
      const details = {};
      let hasContent = false;
      columns.forEach((column, index) => {
        const value = values[index]?.value.trim() || '';
        if (value) {
          details[column] = value;
          hasContent = true;
        }
      });
      if (hasContent) {
        updatedParticipants.push(details);
      }
    }

    if (team.activity === 'Football') {
      const registrationNumbers = updatedParticipants
        .map(participant => normalizeStudentRegistrationNumber(participant['Student Registration Number']))
        .filter(Boolean);
      if (new Set(registrationNumbers).size !== registrationNumbers.length) {
        setDashboardMessage('Each football player must have a unique student registration number.', true);
        return;
      }
      const numbersUsedByOtherTeams = new Set();
      for (const [otherTeamId, rows] of participantsByTeam) {
        if (otherTeamId === team.id || teamsById.get(otherTeamId)?.activity !== 'Football') continue;
        rows.forEach(row => {
          const number = normalizeStudentRegistrationNumber(row.details?.['Student Registration Number']);
          if (number) numbersUsedByOtherTeams.add(number);
        });
      }
      if (registrationNumbers.some(number => numbersUsedByOtherTeams.has(number))) {
        setDashboardMessage('A student registration number is already registered on another football team.', true);
        return;
      }
    }

    try {
      const updatePayload = {
        team_name: teamName,
        coach,
        group_name: groupValue,
      };
      if (team.activity === 'Football' || team.activity === 'Rugby' || team.activity === 'Handball' || team.activity === 'Softball' || team.activity === 'Hockey' || team.activity === 'Volleyball' || team.activity === 'AmericanBall') {
        updatePayload.gender = genderValue || null;
      } else {
        updatePayload.gender = null;
      }
      const { error: teamError } = await supabaseClient
        .from('teams')
        .update(updatePayload)
        .eq('id', team.id);
      if (teamError) throw teamError;

      const { error: deleteError } = await supabaseClient
        .from('registration_participants')
        .delete()
        .eq('team_id', team.id);
      if (deleteError) throw deleteError;

      if (updatedParticipants.length) {
        const inserts = updatedParticipants.map(details => ({ team_id: team.id, details }));
        const { error: insertError } = await supabaseClient
          .from('registration_participants')
          .insert(inserts);
        if (insertError) throw insertError;
      }

      modal.remove();
      setDashboardMessage('Team registration updated.');
      await refreshDashboard();
    } catch (error) {
      setDashboardMessage(error.code === '23505'
        && error.message.includes('registration_participants_student_registration_number_unique')
        ? 'A student registration number is already registered on another football team.'
        : `Could not update the registration: ${error.message}`, true);
    }
  });

  document.body.appendChild(modal);
}

function normalizeStudentRegistrationNumber(value) {
  return String(value || '').trim().toLowerCase();
}

function registeredFootballPlayers(rows) {
  return rows.filter(row => row.details?.['Player Name']?.trim())
    .map(row => ({
      id: String(row.id),
      name: row.details['Player Name'].trim(),
      teamId: String(row.team_id),
    }));
}

function scorerEditorMarkup(fixtureId, side, teamName, opposingTeamName, teamPlayers, opposingPlayers, records) {
  const normalRecords = records.filter(record => !record?.own_goal);
  const ownGoalRecords = records.filter(record => record?.own_goal);
  return `<div class="scorer-editor">
    <strong>${escapeHtml(teamName)} goals</strong>
    <div class="scorer-list" data-scorer-list="${fixtureId}-${side}" data-scorer-side="${side}" data-own-goal="false">
      ${scorerRowsMarkup(normalRecords, teamPlayers)}
      <select class="scorer-player-template hidden" tabindex="-1" aria-hidden="true">
        <option value="">Select registered player</option>${teamPlayers.map(player =>
    `<option value="${escapeHtml(player.id)}" data-team-id="${escapeHtml(player.teamId)}">${escapeHtml(player.name)}</option>`
  ).join('')}
      </select>
    </div>
    <button type="button" class="secondary-btn add-scorer-btn" data-add-scorer data-side="${side}" data-own-goal="false" ${teamPlayers.length ? '' : 'disabled'}>Add goal scorer</button>
    <strong>Own goals credited to ${escapeHtml(teamName)}</strong>
    <div class="scorer-list" data-scorer-list="${fixtureId}-${side}-own" data-scorer-side="${side}" data-own-goal="true">
      ${scorerRowsMarkup(ownGoalRecords, opposingPlayers)}
      <select class="scorer-player-template hidden" tabindex="-1" aria-hidden="true">
        <option value="">Select registered player</option>${opposingPlayers.map(player =>
    `<option value="${escapeHtml(player.id)}" data-team-id="${escapeHtml(player.teamId)}">${escapeHtml(player.name)}</option>`
  ).join('')}
      </select>
    </div>
    <button type="button" class="secondary-btn add-scorer-btn" data-add-scorer data-side="${side}" data-own-goal="true" ${opposingPlayers.length ? '' : 'disabled'}>Add own goal</button>
    <small>${escapeHtml(opposingTeamName)} player must be selected for an own goal.</small>
  </div>`;
}

function scorerRowsMarkup(records, players) {
  const validRecords = records.filter(record =>
    players.some(player => player.id === String(record.participant_id)),
  );
  return validRecords.map(record => `<div class="scorer-row">
    <select class="scorer-player" aria-label="Registered player">
      <option value="">Select registered player</option>
      ${players.map(player => `<option value="${escapeHtml(player.id)}" data-team-id="${escapeHtml(player.teamId)}" ${player.id === String(record.participant_id) ? 'selected' : ''}>${escapeHtml(player.name)}</option>`).join('')}
    </select>
    <input class="scorer-goals" type="number" min="1" step="1" value="${Number.isInteger(record.goals) && record.goals > 0 ? record.goals : 1}" aria-label="Goals scored" />
    <button type="button" class="danger-btn remove-scorer-btn" aria-label="Remove scorer">Remove</button>
  </div>`).join('');
}

function assistEditorMarkup(fixtureId, side, teamName, players, records) {
  const validRecords = records.filter(record =>
    players.some(player => player.id === String(record.participant_id)),
  );
  return `<div class="assist-editor">
    <strong>${escapeHtml(teamName)} assists</strong>
    <div class="assist-list" data-assist-list="${fixtureId}-${side}">
      ${validRecords.map(record => assistRowMarkup(record, players)).join('')}
      <select class="assist-player-template hidden" tabindex="-1" aria-hidden="true">
        <option value="">Select registered player</option>${players.map(player =>
    `<option value="${escapeHtml(player.id)}" data-team-id="${escapeHtml(player.teamId)}">${escapeHtml(player.name)}</option>`
  ).join('')}
      </select>
    </div>
    <button type="button" class="secondary-btn" data-add-assist data-side="${side}" ${players.length ? '' : 'disabled'}>Add assist</button>
  </div>`;
}

function assistRowMarkup(record, players) {
  return `<div class="assist-row">
    <select class="assist-player" aria-label="Player who made the assist">
      <option value="">Select registered player</option>
      ${players.map(player => `<option value="${escapeHtml(player.id)}" data-team-id="${escapeHtml(player.teamId)}" ${player.id === String(record.participant_id) ? 'selected' : ''}>${escapeHtml(player.name)}</option>`).join('')}
    </select>
    <input class="assist-count" type="number" min="1" step="1" value="${Number.isInteger(record.assists) && record.assists > 0 ? record.assists : 1}" aria-label="Assists made" />
    <button type="button" class="danger-btn remove-assist-btn" aria-label="Remove assist">Remove</button>
  </div>`;
}

function addAssistRow(button) {
  const fixtureId = button.closest('tr').querySelector('[data-save-result]').dataset.saveResult;
  const listId = `${fixtureId}-${button.dataset.side}`;
  const list = document.querySelector(`[data-assist-list="${CSS.escape(listId)}"]`);
  const optionSource = list.querySelector('.assist-player-template');
  const row = document.createElement('div');
  row.className = 'assist-row';
  row.innerHTML = `<select class="assist-player" aria-label="Player who made the assist">${optionSource.innerHTML}</select>
    <input class="assist-count" type="number" min="1" step="1" value="1" aria-label="Assists made" />
    <button type="button" class="danger-btn remove-assist-btn" aria-label="Remove assist">Remove</button>`;
  list.insertBefore(row, optionSource);
  row.querySelector('.remove-assist-btn').addEventListener('click', () => row.remove());
}

function addScorerRow(button) {
  const fixtureId = button.closest('tr').querySelector('[data-save-result]').dataset.saveResult;
  const side = button.dataset.side;
  const ownGoal = button.dataset.ownGoal === 'true';
  const listId = `${fixtureId}-${side}${ownGoal ? '-own' : ''}`;
  const list = document.querySelector(`[data-scorer-list="${CSS.escape(listId)}"]`);
  const optionSource = list.querySelector('.scorer-player-template');
  const row = document.createElement('div');
  row.className = 'scorer-row';
  row.innerHTML = `<select class="scorer-player" aria-label="Registered player">${optionSource.innerHTML}</select>
    <input class="scorer-goals" type="number" min="1" step="1" value="1" aria-label="Goals scored" />
    <button type="button" class="danger-btn remove-scorer-btn" aria-label="Remove scorer">Remove</button>`;
  list.insertBefore(row, optionSource);
  row.querySelector('.remove-scorer-btn').addEventListener('click', () => row.remove());
}

function validMatchDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : '';
}

function matchDateReached(value) {
  const date = validMatchDate(value);
  const todayString = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return Boolean(date && date <= todayString);
}

async function removeTeam(id, button) {
  if (!window.confirm('Remove this team? Its participant details and related fixtures will also be deleted.')) return;
  button.disabled = true;
  const { error } = await supabaseClient.from('teams').delete().eq('id', id);
  if (error) {
    button.disabled = false;
    setDashboardMessage(`Could not remove team: ${error.message}`, true);
    return;
  }
  setDashboardMessage('Team and its related fixtures removed.');
  await refreshDashboard();
}

async function removeFixture(id, button) {
  if (!window.confirm('Remove this fixture?')) return;
  button.disabled = true;
  const { error } = await supabaseClient.from('football_fixtures').delete().eq('id', id);
  if (error) {
    button.disabled = false;
    setDashboardMessage(`Could not remove fixture: ${error.message}`, true);
    return;
  }
  setDashboardMessage('Fixture removed.');
  await refreshDashboard();
}

async function addStadium(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.querySelector('#newStadiumName');
  const name = input.value.trim();
  if (!name) return;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  let saved = false;
  try {
    const { error } = await supabaseClient.from('stadiums').insert({ name });
    if (error) {
      setDashboardMessage(error.code === '23505'
        ? 'A stadium with that name already exists.'
        : `Could not add stadium: ${error.message}`, true);
      return;
    }
    saved = true;
    form.reset();
    setDashboardMessage('Stadium added.');
    await refreshDashboard();
  } catch (error) {
    setDashboardMessage(saved
      ? `Stadium added, but the dashboard could not refresh: ${error.message}`
      : `Could not add stadium: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

async function addReferee(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.querySelector('#newRefereeName');
  const name = input.value.trim();
  if (!name) return;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  let saved = false;
  try {
    const { error } = await supabaseClient.from('referees').insert({ name });
    if (error) {
      setDashboardMessage(error.code === '23505'
        ? 'A referee with that name already exists.'
        : `Could not add referee: ${error.message}`, true);
      return;
    }
    saved = true;
    form.reset();
    setDashboardMessage('Referee added.');
    await refreshDashboard();
  } catch (error) {
    setDashboardMessage(saved
      ? `Referee added, but the dashboard could not refresh: ${error.message}`
      : `Could not add referee: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

async function removeStadium(id) {
  if (!window.confirm('Remove this stadium? Fixtures using it will keep their schedules but no longer have a venue assigned.')) return;
  const { error } = await supabaseClient.from('stadiums').delete().eq('id', id);
  if (error) {
    setDashboardMessage(`Could not remove stadium: ${error.message}`, true);
    return;
  }
  setDashboardMessage('Stadium removed.');
  await refreshDashboard();
}

async function removeReferee(id) {
  if (!window.confirm('Remove this referee? Fixtures using this referee will no longer have one assigned.')) return;
  const { error } = await supabaseClient.from('referees').delete().eq('id', id);
  if (error) {
    setDashboardMessage(`Could not remove referee: ${error.message}`, true);
    return;
  }
  setDashboardMessage('Referee removed.');
  await refreshDashboard();
}

function fixtureGroupKey(team) {
  return JSON.stringify([team.gender, team.group_name.trim().toUpperCase()]);
}

function populateGenerateFixturesGroups(teams) {
  const select = document.getElementById('generateFixturesGroups');
  const currentValues = Array.from(select.selectedOptions).map(opt => opt.value);
  const groups = new Map();
  teams.filter(team => team.activity === 'Football' && team.gender && team.group_name?.trim())
    .forEach(team => groups.set(fixtureGroupKey(team), {
      gender: team.gender,
      group: team.group_name.trim(),
    }));
  select.innerHTML = `<option value="">Select groups</option>${[...groups.entries()]
    .sort(([, a], [, b]) => a.gender.localeCompare(b.gender) || a.group.localeCompare(b.group))
    .map(([key, group]) => `<option value="${escapeHtml(key)}">${escapeHtml(`${group.gender} — Group ${group.group}`)}</option>`)
    .join('')}`;
  currentValues.forEach(value => {
    if (groups.has(value)) {
      const option = select.querySelector(`option[value="${CSS.escape(value)}"]`);
      if (option) option.selected = true;
    }
  });
}

async function generateRoundRobinFixtures(event) {
  const button = event.currentTarget;
  const select = document.getElementById('generateFixturesGroups');
  const selectedValues = Array.from(select.selectedOptions).map(opt => opt.value);
  
  if (selectedValues.length === 0 || selectedValues[0] === '') {
    setDashboardMessage('Select at least one group to generate fixtures for.', true);
    return;
  }
  
  const selectedGroups = selectedValues.map(value => {
    try {
      const [gender, groupName] = JSON.parse(value);
      return { gender, groupName };
    } catch {
      return null;
    }
  }).filter(Boolean);
  
  if (!window.confirm(`Generate round-robin fixtures for ${selectedGroups.length} group(s)? This will create all unique matchups for Round 1.`)) return;
  
  button.disabled = true;
  try {
    let fixturesCreated = 0;
    let fixturesSkipped = 0;
    
    for (const { gender, groupName } of selectedGroups) {
      const groupTeams = adminTeams.filter(team =>
        team.activity === 'Football'
        && team.gender === gender
        && team.group_name?.trim().toUpperCase() === groupName.toUpperCase()
      );
      
      if (groupTeams.length < 2) {
        setDashboardMessage(`Group ${gender} — ${groupName} has fewer than 2 teams. Skipping.`, true);
        continue;
      }
      
      const fixturesToInsert = [];
      for (let i = 0; i < groupTeams.length; i++) {
        for (let j = i + 1; j < groupTeams.length; j++) {
          fixturesToInsert.push({
            gender,
            group_name: groupName.trim(),
            match_round: 1,
            home_team_id: groupTeams[i].id,
            away_team_id: groupTeams[j].id,
          });
        }
      }
      
      if (fixturesToInsert.length === 0) continue;
      
      const { data, error } = await supabaseClient
        .from('football_fixtures')
        .insert(fixturesToInsert)
        .select('id');
      
      if (error) {
        if (error.code === '23505') {
          setDashboardMessage(`Some fixtures for Group ${gender} — ${groupName} already exist. Partial creation may have occurred.`, true);
          fixturesSkipped += fixturesToInsert.length;
        } else {
          setDashboardMessage(`Could not generate fixtures for Group ${gender} — ${groupName}: ${error.message}`, true);
        }
      } else {
        fixturesCreated += data?.length || fixturesToInsert.length;
      }
    }
    
    if (fixturesCreated > 0) {
      setDashboardMessage(`${fixturesCreated} round-robin fixture(s) generated. Set their dates, times, stadiums, and referees in the schedule column.`);
      select.value = '';
      await refreshDashboard();
    } else if (fixturesSkipped > 0) {
      setDashboardMessage('No new fixtures were created (may already exist).', true);
    }
  } catch (error) {
    setDashboardMessage(`Could not generate fixtures: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

function populateFixtureGroupOptions(teams) {
  const select = document.getElementById('newFixtureGroup');
  const currentValue = select.value;
  const groups = new Map();
  teams.filter(team => team.activity === 'Football' && team.gender && team.group_name?.trim())
    .forEach(team => groups.set(fixtureGroupKey(team), {
      gender: team.gender,
      group: team.group_name.trim(),
    }));
  select.innerHTML = `<option value="">Select group</option>${[...groups.entries()]
    .sort(([, a], [, b]) => a.gender.localeCompare(b.gender) || a.group.localeCompare(b.group))
    .map(([key, group]) => `<option value="${escapeHtml(key)}">${escapeHtml(`${group.gender} — Group ${group.group}`)}</option>`)
    .join('')}`;
  if (groups.has(currentValue)) select.value = currentValue;
  updateFixtureTeamOptions();
}

function updateFixtureTeamOptions() {
  const groupSelect = document.getElementById('newFixtureGroup');
  const selectedKey = groupSelect.value;
  let selectedGroup;
  try {
    selectedGroup = JSON.parse(selectedKey);
  } catch {
    selectedGroup = null;
  }
  const groupTeams = selectedGroup
    ? adminTeams.filter(team => team.activity === 'Football'
      && team.gender === selectedGroup[0]
      && team.group_name?.trim().toUpperCase() === selectedGroup[1])
    : [];
  const homeSelect = document.getElementById('newFixtureHome');
  const awaySelect = document.getElementById('newFixtureAway');
  const homeValue = homeSelect.value;
  const awayValue = awaySelect.value;
  const optionsFor = (label, excludedValue) => `<option value="">Select ${label} team</option>${groupTeams
    .filter(team => team.id !== excludedValue)
    .map(team => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.team_name)}</option>`)
    .join('')}`;
  homeSelect.innerHTML = optionsFor('home', awayValue);
  awaySelect.innerHTML = optionsFor('away', homeValue);
  homeSelect.disabled = groupTeams.length < 2;
  awaySelect.disabled = groupTeams.length < 2;
  if (groupTeams.some(team => team.id === homeValue) && homeValue !== awayValue) homeSelect.value = homeValue;
  if (groupTeams.some(team => team.id === awayValue) && awayValue !== homeValue) awaySelect.value = awayValue;
}

async function addFixture(event) {
  event.preventDefault();
  const form = event.currentTarget;
  let group;
  try {
    group = JSON.parse(document.getElementById('newFixtureGroup').value || 'null');
  } catch {
    group = null;
  }
  const homeTeamId = document.getElementById('newFixtureHome').value;
  const awayTeamId = document.getElementById('newFixtureAway').value;
  const matchRound = Number(document.getElementById('newFixtureRound').value);
  if (!group || !homeTeamId || !awayTeamId || homeTeamId === awayTeamId
      || !Number.isInteger(matchRound) || matchRound < 1) {
    setDashboardMessage('Select a group, a positive whole-number round, and two different teams for the fixture.', true);
    return;
  }
  const homeTeam = adminTeams.find(team => team.id === homeTeamId);
  const awayTeam = adminTeams.find(team => team.id === awayTeamId);
  if (!homeTeam || !awayTeam || fixtureGroupKey(homeTeam) !== fixtureGroupKey(awayTeam)
      || fixtureGroupKey(homeTeam) !== JSON.stringify(group)) {
    setDashboardMessage('Choose two teams from the selected group.', true);
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const { error } = await supabaseClient.from('football_fixtures').insert({
      gender: group[0],
      group_name: homeTeam.group_name.trim(),
      match_round: matchRound,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
    });
    if (error) {
      setDashboardMessage(error.code === '23505'
        ? 'That matchup already exists in this round.'
        : `Could not add fixture: ${error.message}`, true);
      return;
    }
    form.reset();
    updateFixtureTeamOptions();
    setDashboardMessage('Fixture added. Set its date, time, stadium, and referee in the schedule column.');
    await refreshDashboard();
  } catch (error) {
    setDashboardMessage(`Could not add fixture: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

async function clearUnplayedFixtures(event) {
  if (!window.confirm('Remove all unplayed fixtures and their saved dates, times, stadiums, and referees? Played matches and results will be kept.')) return;
  const button = event.currentTarget;
  button.disabled = true;
  const { error } = await supabaseClient
    .from('football_fixtures')
    .delete()
    .neq('match_status', 'played');
  if (error) {
    button.disabled = false;
    setDashboardMessage(`Could not clear unplayed fixtures: ${error.message}`, true);
    return;
  }
  setDashboardMessage('Unplayed fixtures cleared. Played matches and results were kept.');
  await refreshDashboard();
}

function validMatchTime(value) {
  return /^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value || '') ? value.slice(0, 5) : '';
}

async function saveFixtureSchedule(id, button) {
  const matchDate = document.querySelector(`[data-fixture-date="${CSS.escape(id)}"]`).value;
  const matchTime = document.querySelector(`[data-fixture-time="${CSS.escape(id)}"]`).value;
  const stadiumId = document.querySelector(`[data-fixture-stadium="${CSS.escape(id)}"]`).value;
  const refereeId = document.querySelector(`[data-fixture-referee="${CSS.escape(id)}"]`).value;
  if (!validMatchDate(matchDate) || !validMatchTime(matchTime) || !stadiumId || !refereeId) {
    setDashboardMessage('Choose a match date, time, stadium, and referee before saving the schedule.', true);
    return;
  }
  button.disabled = true;
  const { error } = await supabaseClient
    .from('football_fixtures')
    .update({
      match_date: matchDate,
      match_time: matchTime,
      stadium_id: stadiumId,
      referee_id: refereeId,
    })
    .eq('id', id);
  if (error) {
    button.disabled = false;
    setDashboardMessage(`Could not save match schedule: ${error.message}`, true);
    return;
  }
  setDashboardMessage('Match date, time, stadium, and referee saved.');
  await refreshDashboard();
}

async function saveFixtureResult(id, button) {
  const homeInput = document.querySelector(`[data-home-score="${CSS.escape(id)}"]`);
  const awayInput = document.querySelector(`[data-away-score="${CSS.escape(id)}"]`);
  const homeScore = homeInput.value;
  const awayScore = awayInput.value;
  if (homeScore === '' || awayScore === '' || !Number.isInteger(Number(homeScore)) || !Number.isInteger(Number(awayScore))
      || Number(homeScore) < 0 || Number(awayScore) < 0) {
    setDashboardMessage('Enter a non-negative whole-number score for both teams.', true);
    return;
  }
  const homeScorers = collectScorers(id, 'home', Number(homeScore));
  const awayScorers = collectScorers(id, 'away', Number(awayScore));
  if (!homeScorers || !awayScorers) return;
  const homeAssists = collectAssists(id, 'home', homeScorers);
  const awayAssists = collectAssists(id, 'away', awayScorers);
  if (!homeAssists || !awayAssists) return;
  button.disabled = true;
  const { error } = await supabaseClient
    .from('football_fixtures')
    .update({
      home_score: Number(homeScore),
      away_score: Number(awayScore),
      scorers: { home: homeScorers, away: awayScorers },
      assists: { home: homeAssists, away: awayAssists },
      match_status: 'played',
    })
    .eq('id', id);
  if (error) {
    button.disabled = false;
    setDashboardMessage(`Could not save match result: ${error.message}`, true);
    return;
  }
  setDashboardMessage('Match result saved and standings updated.');
  await refreshDashboard();
}

function collectScorers(fixtureId, side, score) {
  const records = [];
  let total = 0;
  for (const ownGoal of [false, true]) {
    const listId = `${fixtureId}-${side}${ownGoal ? '-own' : ''}`;
    const list = document.querySelector(`[data-scorer-list="${CSS.escape(listId)}"]`);
    for (const row of list.querySelectorAll('.scorer-row')) {
      const playerInput = row.querySelector('.scorer-player');
      const goalsInput = row.querySelector('.scorer-goals');
      const selected = playerInput.selectedOptions[0];
      const count = Number(goalsInput.value);
      if (!playerInput.value || !selected || !Number.isInteger(count) || count < 1) {
        setDashboardMessage('Choose a registered player and enter a positive whole-number goal count for every scorer row.', true);
        return null;
      }
      total += count;
      records.push({
        participant_id: playerInput.value,
        team_id: selected.dataset.teamId,
        player: selected.textContent,
        goals: count,
        own_goal: ownGoal,
      });
    }
  }
  if (total > score) {
    setDashboardMessage(`Scorer totals for ${side} cannot exceed that team's match score (${score}).`, true);
    return null;
  }
  return records;
}

function collectAssists(fixtureId, side, scorers) {
  const listId = `${fixtureId}-${side}`;
  const list = document.querySelector(`[data-assist-list="${CSS.escape(listId)}"]`);
  const records = [];
  let total = 0;
  for (const row of list.querySelectorAll('.assist-row')) {
    const playerInput = row.querySelector('.assist-player');
    const count = Number(row.querySelector('.assist-count').value);
    const selected = playerInput.selectedOptions[0];
    if (!playerInput.value || !selected || !Number.isInteger(count) || count < 1) {
      setDashboardMessage('Choose a registered player and enter a positive whole-number assist count for every assist row.', true);
      return null;
    }
    total += count;
    records.push({
      participant_id: playerInput.value,
      team_id: selected.dataset.teamId,
      player: selected.textContent,
      assists: count,
    });
  }

  const nonOwnGoals = scorers
    .filter(record => !record.own_goal)
    .reduce((sum, record) => sum + record.goals, 0);
  if (total > nonOwnGoals) {
    setDashboardMessage(`Assist totals for ${side} cannot exceed non-own goals scored (${nonOwnGoals}).`, true);
    return null;
  }
  return records;
}

async function setFixtureStatus(id, status, button) {
  button.disabled = true;
  const update = status === 'postponed'
    ? { match_status: status, home_score: null, away_score: null, scorers: { home: [], away: [] }, assists: { home: [], away: [] } }
    : { match_status: status };
  const { error } = await supabaseClient
    .from('football_fixtures')
    .update(update)
    .eq('id', id);
  if (error) {
    button.disabled = false;
    setDashboardMessage(`Could not update fixture status: ${error.message}`, true);
    return;
  }
  setDashboardMessage(status === 'postponed' ? 'Match marked as postponed.' : 'Match marked as scheduled.');
  await refreshDashboard();
}

function setDashboardMessage(message, isError = false) {
  const element = document.getElementById('dashboardMessage');
  element.textContent = message;
  element.classList.toggle('error-text', isError);
}

function initializeAdmin() {
  if (!window.supabase?.createClient) {
    setLoginMessage('Could not load Supabase. Check your internet connection and reload this page.', true);
    return;
  }
  if (!window.SUPABASE_CONFIG?.url || !window.SUPABASE_CONFIG?.anonKey) {
    setLoginMessage('Supabase is not configured. Check supabase-config.js.', true);
    return;
  }

  try {
    supabaseClient = window.supabase.createClient(
      window.SUPABASE_CONFIG.url,
      window.SUPABASE_CONFIG.anonKey,
    );
  } catch (error) {
    setLoginMessage(`Could not initialize Supabase: ${error.message}`, true);
    return;
  }

  document.getElementById('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.getElementById('loginButton');
    button.disabled = true;
    setLoginMessage('Signing in…');
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: document.getElementById('adminEmail').value.trim(),
        password: document.getElementById('adminPassword').value,
      });
      if (error) throw error;
      await verifyAdmin(data.user);
    } catch (error) {
      setLoginMessage(`Sign-in failed: ${error.message || 'Check your connection and try again.'}`, true);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('signOutButton').addEventListener('click', async () => {
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
      dashboard.classList.add('hidden');
      loginPanel.classList.remove('hidden');
      setLoginMessage('Signed out.');
    } catch (error) {
      setDashboardMessage(`Could not sign out: ${error.message}`, true);
    }
  });

  document.getElementById('addStadiumForm').addEventListener('submit', addStadium);
  document.getElementById('addRefereeForm').addEventListener('submit', addReferee);
  document.getElementById('newFixtureGroup').addEventListener('change', updateFixtureTeamOptions);
  document.getElementById('newFixtureHome').addEventListener('change', updateFixtureTeamOptions);
  document.getElementById('newFixtureAway').addEventListener('change', updateFixtureTeamOptions);
  document.getElementById('addFixtureForm').addEventListener('submit', addFixture);
  document.getElementById('generateRoundRobinBtn').addEventListener('click', generateRoundRobinFixtures);
  document.getElementById('clearUnplayedFixturesBtn').addEventListener('click', clearUnplayedFixtures);
  setLoginMessage('Ready to sign in.');

  supabaseClient.auth.getSession()
    .then(({ data, error }) => {
      if (error) throw error;
      if (data.session) return verifyAdmin(data.session.user);
    })
    .catch(error => setLoginMessage(`Could not restore session: ${error.message}`, true));
}

initializeAdmin();
