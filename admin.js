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
  const [teamsResult, participantsResult, fixturesResult] = await Promise.all([
    supabaseClient.from('teams').select('id, activity, team_name, gender, coach, group_name, created_at').order('created_at', { ascending: false }),
    supabaseClient.from('registration_participants').select('id, team_id, details'),
    supabaseClient.from('football_fixtures').select('id, gender, group_name, home_team_id, away_team_id, match_date, match_status, home_score, away_score, scorers, assists').order('gender').order('group_name'),
  ]);
  const error = teamsResult.error || participantsResult.error || fixturesResult.error;
  if (error) throw error;

  const teams = teamsResult.data;
  const teamsById = new Map(teams.map(team => [team.id, team]));
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
        <td>${escapeHtml(`${fixture.gender} — ${fixture.group_name}`)}</td>
        <td>${escapeHtml(homeName)} vs ${escapeHtml(awayName)}</td>
        <td><input class="date-input" type="date" value="${escapeHtml(validMatchDate(fixture.match_date))}" data-fixture-date="${fixture.id}" />
          <button class="secondary-btn save-date-btn" data-save-date="${fixture.id}">Save date</button></td>
        <td>
          <span class="match-status">${escapeHtml(fixture.match_status || 'scheduled')}</span>
          ${canEditResult ? `<div class="score-inputs">
            <label>${escapeHtml(homeName)}<input type="number" min="0" step="1" value="${fixture.home_score ?? ''}" data-home-score="${fixture.id}" aria-label="${escapeHtml(homeName)} goals" /></label>
            <label>${escapeHtml(awayName)}<input type="number" min="0" step="1" value="${fixture.away_score ?? ''}" data-away-score="${fixture.id}" aria-label="${escapeHtml(awayName)} goals" /></label>
          </div>` : fixture.match_status === 'postponed' ? '<p>Awaiting a new match date.</p>' : '<p>Result entry opens on the match date.</p>'}
        </td>
        <td>${canEditResult ? `
          ${scorerEditorMarkup(fixture.id, 'home', homeName, awayName, homePlayers, awayPlayers, homeScorers)}
          ${scorerEditorMarkup(fixture.id, 'away', awayName, homeName, awayPlayers, homePlayers, awayScorers)}
          ${assistEditorMarkup(fixture.id, 'home', homeName, homePlayers, homeAssists)}
          ${assistEditorMarkup(fixture.id, 'away', awayName, awayPlayers, awayAssists)}
        ` : '—'}</td>
        <td class="table-actions">
          ${canEditResult ? `<button class="primary-btn save-result-btn" data-save-result="${fixture.id}">Save result</button>` : ''}
          ${fixture.match_status === 'postponed'
            ? `<button class="secondary-btn schedule-match-btn" data-schedule-match="${fixture.id}">Mark scheduled</button>`
            : (due && fixture.match_status !== 'played' ? `<button class="secondary-btn postpone-match-btn" data-postpone-match="${fixture.id}">Mark postponed</button>` : '')}
          <button class="danger-btn" data-delete-fixture="${fixture.id}">Remove fixture</button>
        </td>
      </tr>`;
  }).join('');
  document.getElementById('adminFixtures').innerHTML = fixtures.length ? `
    <table class="admin-table"><thead><tr><th>Group</th><th>Match</th><th>Date</th><th>Status / result</th><th>Goalscorers and assists</th><th>Actions</th></tr></thead>
      <tbody>${fixtureRows}</tbody>
    </table>
  ` : '<p class="empty-state">No fixtures have been generated yet.</p>';

  document.querySelectorAll('[data-edit-team]').forEach(button => {
    button.addEventListener('click', () => {
      const team = teams.find(item => item.id === button.dataset.editTeam);
      if (!team) return;
      const people = participantsByTeam.get(team.id) || [];
      openTeamEditDialog(team, people);
    });
  });
  document.querySelectorAll('[data-delete-team]').forEach(button => {
    button.addEventListener('click', () => removeTeam(button.dataset.deleteTeam, button));
  });
  document.querySelectorAll('[data-delete-fixture]').forEach(button => {
    button.addEventListener('click', () => removeFixture(button.dataset.deleteFixture, button));
  });
  document.querySelectorAll('[data-save-date]').forEach(button => {
    button.addEventListener('click', () => saveFixtureDate(button.dataset.saveDate, button));
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

function openTeamEditDialog(team, people) {
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
      setDashboardMessage(`Could not update the registration: ${error.message}`, true);
    }
  });

  document.body.appendChild(modal);
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
    </div>
    <button type="button" class="secondary-btn add-scorer-btn" data-add-scorer data-side="${side}" data-own-goal="false" ${teamPlayers.length ? '' : 'disabled'}>Add scorer</button>
    <strong>Own goals credited to ${escapeHtml(teamName)}</strong>
    <div class="scorer-list" data-scorer-list="${fixtureId}-${side}-own" data-scorer-side="${side}" data-own-goal="true">
      ${scorerRowsMarkup(ownGoalRecords, opposingPlayers)}
    </div>
    <button type="button" class="secondary-btn add-scorer-btn" data-add-scorer data-side="${side}" data-own-goal="true" ${opposingPlayers.length ? '' : 'disabled'}>Add own goal</button>
    <small>${escapeHtml(opposingTeamName)} player must be selected for an own goal.</small>
  </div>`;
}

function scorerRowsMarkup(records, players) {
  const validRecords = records.filter(record =>
    players.some(player => player.id === String(record.participant_id)),
  );
  const rows = validRecords.length ? validRecords : (players.length ? [{ participant_id: '', goals: 1 }] : []);
  return rows.map(record => `<div class="scorer-row">
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
  const optionSource = list.querySelector('.scorer-player');
  if (!optionSource) return;
  const row = document.createElement('div');
  row.className = 'scorer-row';
  row.innerHTML = `<select class="scorer-player" aria-label="Registered player"><option value="">Select registered player</option>${[...optionSource.options].slice(1).map(option => `<option value="${escapeHtml(option.value)}" data-team-id="${escapeHtml(option.dataset.teamId)}">${escapeHtml(option.textContent)}</option>`).join('')}</select>
    <input class="scorer-goals" type="number" min="1" step="1" value="1" aria-label="Goals scored" />
    <button type="button" class="danger-btn remove-scorer-btn" aria-label="Remove scorer">Remove</button>`;
  list.appendChild(row);
  row.querySelector('.remove-scorer-btn').addEventListener('click', () => row.remove());
}

function validMatchDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : '';
}

function matchDateReached(value) {
  const date = validMatchDate(value);
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
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

async function saveFixtureDate(id, button) {
  const input = document.querySelector(`[data-fixture-date="${CSS.escape(id)}"]`);
  button.disabled = true;
  const { error } = await supabaseClient
    .from('football_fixtures')
    .update({ match_date: input.value })
    .eq('id', id);
  if (error) {
    button.disabled = false;
    setDashboardMessage(`Could not save match date: ${error.message}`, true);
    return;
  }
  setDashboardMessage('Match date saved.');
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

  setLoginMessage('Ready to sign in.');

  supabaseClient.auth.getSession()
    .then(({ data, error }) => {
      if (error) throw error;
      if (data.session) return verifyAdmin(data.session.user);
    })
    .catch(error => setLoginMessage(`Could not restore session: ${error.message}`, true));
}

initializeAdmin();
