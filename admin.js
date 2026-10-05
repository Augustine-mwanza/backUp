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
    supabaseClient.from('football_fixtures').select('id, gender, group_name, home_team_id, away_team_id, match_date, match_time, match_status, home_score, away_score, scorers, assists').order('gender').order('group_name'),
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
  const fixturesByGroup = new Map();
  fixtures.forEach(fixture => {
    const key = `${fixture.gender}|${fixture.group_name}`;
    const groupFixtures = fixturesByGroup.get(key) || [];
    groupFixtures.push(fixture);
    fixturesByGroup.set(key, groupFixtures);
  });
  document.getElementById('adminFixtures').innerHTML = fixtures.length ? [...fixturesByGroup.entries()].map(([key, groupFixtures]) => {
    const [gender, groupName] = key.split('|');
    return `<section class="admin-fixture-group">
      <h4>${escapeHtml(gender)} — Group ${escapeHtml(groupName)}</h4>
      <div class="admin-fixture-grid">${groupFixtures.map(fixture => {
    const homeName = teamsById.get(fixture.home_team_id)?.team_name || 'Team removed';
    const awayName = teamsById.get(fixture.away_team_id)?.team_name || 'Team removed';
    const due = matchDateReached(fixture.match_date);
    const canEditResult = fixture.match_status !== 'postponed'
      && (fixture.match_status === 'played' || due);
    const scorerData = fixture.scorers || { home: [], away: [] };
    const homeScorers = Array.isArray(scorerData.home) ? scorerData.home : [];
    const awayScorers = Array.isArray(scorerData.away) ? scorerData.away : [];
    const assistData = fixture.assists || { home: [], away: [] };
    const homeAssists = Array.isArray(assistData.home) ? assistData.home : [];
    const awayAssists = Array.isArray(assistData.away) ? assistData.away : [];
    const homePlayers = registeredFootballPlayers(participantsByTeam.get(fixture.home_team_id) || []);
    const awayPlayers = registeredFootballPlayers(participantsByTeam.get(fixture.away_team_id) || []);
    const canManageResult = canEditResult;
    return `<article class="admin-fixture-card" data-admin-fixture="${fixture.id}" data-home-team-id="${fixture.home_team_id}" data-away-team-id="${fixture.away_team_id}">
      <header class="admin-fixture-heading">
        <div class="admin-fixture-teams"><strong>${escapeHtml(homeName)}</strong><span>vs</span><strong>${escapeHtml(awayName)}</strong></div>
        <span class="match-status">${escapeHtml(fixture.match_status || 'scheduled')}</span>
      </header>
      <div class="admin-fixture-schedule">
        <label>Date<input class="date-input" type="date" value="${escapeHtml(validMatchDate(fixture.match_date))}" data-fixture-date="${fixture.id}" /></label>
        <label>Time<input class="time-input" type="time" value="${escapeHtml(validMatchTime(fixture.match_time))}" data-fixture-time="${fixture.id}" /></label>
        <button type="button" class="secondary-btn" data-save-date="${fixture.id}">Save date &amp; time</button>
      </div>
      ${canManageResult ? `<div class="admin-side-results">
        ${fixtureSideEditorMarkup(fixture, 'home', homeName, awayName, homePlayers, awayPlayers, homeScorers, homeAssists)}
        ${fixtureSideEditorMarkup(fixture, 'away', awayName, homeName, awayPlayers, homePlayers, awayScorers, awayAssists)}
      </div>` : `<p class="admin-result-hint">${fixture.match_status === 'postponed' ? 'Awaiting a new match date.' : 'Result entry opens on the match date.'}</p>`}
      <footer class="admin-fixture-actions">
        ${fixture.match_status === 'postponed'
          ? `<button type="button" class="secondary-btn" data-schedule-match="${fixture.id}">Mark scheduled</button>`
          : (due && fixture.match_status !== 'played' ? `<button type="button" class="secondary-btn" data-postpone-match="${fixture.id}">Mark postponed</button>` : '')}
        <button type="button" class="danger-btn" data-delete-fixture="${fixture.id}">Remove fixture</button>
      </footer>
    </article>`;
  }).join('')}</div>
    </section>`;
  }).join('') : '<p class="empty-state">No fixtures have been generated yet.</p>';

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
  document.querySelectorAll('[data-save-side-result]').forEach(button => {
    button.addEventListener('click', () => saveFixtureSideResult(button.dataset.fixtureId, button.dataset.side, button));
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
  document.querySelectorAll('.scorer-player').forEach(picker => {
    bindPlayerPicker(picker.closest('.scorer-row'), '.scorer-player');
  });
  document.querySelectorAll('.assist-player').forEach(picker => {
    bindPlayerPicker(picker.closest('.assist-row'), '.assist-player');
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

function fixtureSideEditorMarkup(fixture, side, teamName, opposingTeamName, players, opposingPlayers, scorers, assists) {
  return `<section class="admin-fixture-side">
    <h5>${escapeHtml(teamName)}</h5>
    <label class="admin-side-score">Score
      <input type="number" min="0" step="1" value="${fixture[`${side}_score`] ?? ''}" data-side-score="${fixture.id}-${side}" aria-label="${escapeHtml(teamName)} score" />
    </label>
    ${scorerEditorMarkup(fixture.id, side, teamName, opposingTeamName, players, opposingPlayers, scorers)}
    ${assistEditorMarkup(fixture.id, side, teamName, players, assists)}
    <button type="button" class="primary-btn side-save-btn" data-save-side-result data-fixture-id="${fixture.id}" data-side="${side}">Save ${escapeHtml(teamName)}</button>
  </section>`;
}

function registeredFootballPlayers(rows) {
  return rows.map(row => {
    const details = row.details || {};
    const playerName = Object.entries(details)
      .find(([key]) => key.trim().toLowerCase() === 'player name')?.[1];
    return typeof playerName === 'string' && playerName.trim()
      ? { id: String(row.id), name: playerName.trim(), teamId: String(row.team_id) }
      : null;
  }).filter(Boolean);
}

function scorerEditorMarkup(fixtureId, side, teamName, opposingTeamName, teamPlayers, opposingPlayers, records) {
  const normalRecords = records.filter(record => !record?.own_goal);
  const ownGoalRecords = records.filter(record => record?.own_goal);
  return `<div class="scorer-editor">
    <strong>${escapeHtml(teamName)} goals</strong>
    <div class="scorer-list" data-scorer-list="${fixtureId}-${side}" data-scorer-side="${side}" data-own-goal="false">
      ${scorerRowsMarkup(normalRecords, teamPlayers)}
      ${scorerPlayerTemplateMarkup(teamPlayers)}
    </div>
    <button type="button" class="secondary-btn add-scorer-btn" data-add-scorer data-side="${side}" data-own-goal="false">Add scorer</button>
    <strong>Own goals credited to ${escapeHtml(teamName)}</strong>
    <div class="scorer-list" data-scorer-list="${fixtureId}-${side}-own" data-scorer-side="${side}" data-own-goal="true">
      ${scorerRowsMarkup(ownGoalRecords, opposingPlayers)}
      ${scorerPlayerTemplateMarkup(opposingPlayers)}
    </div>
    <button type="button" class="secondary-btn add-scorer-btn" data-add-scorer data-side="${side}" data-own-goal="true">Add own goal</button>
    <small>${escapeHtml(opposingTeamName)} player must be selected for an own goal.</small>
  </div>`;
}

function scorerPlayerTemplateMarkup(players) {
  return `<select class="scorer-player-template hidden" tabindex="-1" aria-hidden="true">
    <option value="">Select registered player</option>
    ${players.map(player => `<option value="${escapeHtml(player.id)}" data-team-id="${escapeHtml(player.teamId)}">${escapeHtml(player.name)}</option>`).join('')}
    <option value="manual">Enter player manually</option>
  </select>`;
}

function scorerRowsMarkup(records, players) {
  const rows = records.length ? records : [{ participant_id: '', goals: 1 }];
  return rows.map(record => {
    const isRegistered = players.some(player => player.id === String(record.participant_id));
    const isManual = !isRegistered && Boolean(record.player?.trim());
    return `<div class="scorer-row">
      <select class="scorer-player" aria-label="Registered player">
        <option value="">Select registered player</option>
        ${players.length ? '' : '<option value="" disabled>No registered players found for this team</option>'}
        ${players.map(player => `<option value="${escapeHtml(player.id)}" data-team-id="${escapeHtml(player.teamId)}" ${isRegistered && player.id === String(record.participant_id) ? 'selected' : ''}>${escapeHtml(player.name)}</option>`).join('')}
        <option value="manual" ${isManual ? 'selected' : ''}>Enter player manually</option>
      </select>
      <label class="manual-player-field${isManual ? '' : ' hidden'}">
        <span class="sr-only">Player name</span>
        <input class="manual-player-name" type="text" maxlength="120" value="${isManual ? escapeHtml(record.player || '') : ''}" placeholder="Type player name" aria-label="Player name" />
      </label>
      <input class="scorer-goals" type="number" min="1" step="1" value="${Number.isInteger(record.goals) && record.goals > 0 ? record.goals : 1}" aria-label="Goals scored" />
      <button type="button" class="danger-btn remove-scorer-btn" aria-label="Remove scorer">Remove</button>
    </div>`;
  }).join('');
}

function assistEditorMarkup(fixtureId, side, teamName, players, records) {
  const rows = records.length ? records : [{ participant_id: '', assists: 1 }];
  return `<div class="assist-editor">
    <strong>${escapeHtml(teamName)} assists</strong>
    <div class="assist-list" data-assist-list="${fixtureId}-${side}">
      ${rows.map(record => assistRowMarkup(record, players)).join('')}
      <select class="assist-player-template hidden" tabindex="-1" aria-hidden="true">
        <option value="">Select registered player</option>
        ${players.map(player => `<option value="${escapeHtml(player.id)}" data-team-id="${escapeHtml(player.teamId)}">${escapeHtml(player.name)}</option>`).join('')}
        <option value="manual">Enter player manually</option>
      </select>
    </div>
    <button type="button" class="secondary-btn" data-add-assist data-side="${side}">Add assist</button>
  </div>`;
}

function assistRowMarkup(record, players) {
  const isRegistered = players.some(player => player.id === String(record.participant_id));
  const isManual = !isRegistered && Boolean(record.player?.trim());
  return `<div class="assist-row">
    <select class="assist-player" aria-label="Player who made the assist">
      <option value="">Select registered player</option>
      ${players.length ? '' : '<option value="" disabled>No registered players found for this team</option>'}
      ${players.map(player => `<option value="${escapeHtml(player.id)}" data-team-id="${escapeHtml(player.teamId)}" ${isRegistered && player.id === String(record.participant_id) ? 'selected' : ''}>${escapeHtml(player.name)}</option>`).join('')}
      <option value="manual" ${isManual ? 'selected' : ''}>Enter player manually</option>
    </select>
    <label class="manual-player-field${isManual ? '' : ' hidden'}">
      <span class="sr-only">Player name</span>
      <input class="manual-player-name" type="text" maxlength="120" value="${isManual ? escapeHtml(record.player || '') : ''}" placeholder="Type player name" aria-label="Player name" />
    </label>
    <input class="assist-count" type="number" min="1" step="1" value="${Number.isInteger(record.assists) && record.assists > 0 ? record.assists : 1}" aria-label="Assists made" />
    <button type="button" class="danger-btn remove-assist-btn" aria-label="Remove assist">Remove</button>
  </div>`;
}

function addAssistRow(button) {
  const fixtureId = button.closest('[data-admin-fixture]').dataset.adminFixture;
  const listId = `${fixtureId}-${button.dataset.side}`;
  const list = document.querySelector(`[data-assist-list="${CSS.escape(listId)}"]`);
  const players = registeredFootballPlayersForPicker(list);
  const template = list.querySelector('.assist-player-template');
  const wrapper = document.createElement('div');
  wrapper.innerHTML = assistRowMarkup({ participant_id: '', assists: 1 }, players);
  const newRow = wrapper.firstElementChild;
  list.insertBefore(newRow, template);
  newRow.querySelector('.remove-assist-btn').addEventListener('click', () => newRow.remove());
  bindPlayerPicker(newRow, '.assist-player');
}

function addScorerRow(button) {
  const fixtureId = button.closest('[data-admin-fixture]').dataset.adminFixture;
  const side = button.dataset.side;
  const ownGoal = button.dataset.ownGoal === 'true';
  const listId = `${fixtureId}-${side}${ownGoal ? '-own' : ''}`;
  const list = document.querySelector(`[data-scorer-list="${CSS.escape(listId)}"]`);
  const optionSource = list.querySelector('.scorer-player-template');
  const players = [...optionSource.options]
    .filter(option => option.value && option.value !== 'manual')
    .map(option => ({ id: option.value, name: option.textContent, teamId: option.dataset.teamId }));
  const wrapper = document.createElement('div');
  wrapper.innerHTML = scorerRowsMarkup([{ participant_id: '', goals: 1 }], players);
  const newRow = wrapper.firstElementChild;
  list.appendChild(newRow);
  newRow.querySelector('.remove-scorer-btn').addEventListener('click', () => newRow.remove());
  bindPlayerPicker(newRow, '.scorer-player');
}

function registeredFootballPlayersForPicker(list) {
  return [...list.querySelector('.assist-player-template').options]
    .filter(option => option.value && option.value !== 'manual')
    .map(option => ({ id: option.value, name: option.textContent, teamId: option.dataset.teamId }));
}

function bindPlayerPicker(row, selector) {
  const picker = row.querySelector(selector);
  picker.addEventListener('change', () => {
    row.querySelector('.manual-player-field').classList.toggle('hidden', picker.value !== 'manual');
  });
}

function validMatchDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : '';
}

function validMatchTime(value) {
  return /^\d{2}:\d{2}$/.test(value || '') ? value : '';
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
  const timeInput = document.querySelector(`[data-fixture-time="${CSS.escape(id)}"]`);
  button.disabled = true;
  const { error } = await supabaseClient
    .from('football_fixtures')
    .update({ match_date: input.value, match_time: timeInput.value })
    .eq('id', id);
  if (error) {
    button.disabled = false;
    setDashboardMessage(`Could not save match date: ${error.message}`, true);
    return;
  }
  setDashboardMessage('Match date saved.');
  await refreshDashboard();
}

async function saveFixtureSideResult(id, side, button) {
  const scoreInput = document.querySelector(`[data-side-score="${CSS.escape(`${id}-${side}`)}"]`);
  const scoreText = scoreInput.value;
  if (scoreText === '' || !Number.isInteger(Number(scoreText)) || Number(scoreText) < 0) {
    setDashboardMessage(`Enter a non-negative whole-number score for ${side}.`, true);
    return;
  }
  const score = Number(scoreText);
  const sideScorers = collectScorers(id, side, score);
  if (!sideScorers) return;
  const sideAssists = collectAssists(id, side, sideScorers);
  if (!sideAssists) return;

  button.disabled = true;
  const { data: fixture, error: loadError } = await supabaseClient
    .from('football_fixtures')
    .select('home_score, away_score, match_status, scorers, assists')
    .eq('id', id)
    .single();
  if (loadError) {
    button.disabled = false;
    setDashboardMessage(`Could not load current match data: ${loadError.message}`, true);
    return;
  }
  const opponentSide = side === 'home' ? 'away' : 'home';
  const opponentScore = fixture[`${opponentSide}_score`];
  const scorers = fixture.scorers || { home: [], away: [] };
  const assists = fixture.assists || { home: [], away: [] };
  scorers[side] = sideScorers;
  assists[side] = sideAssists;
  const update = {
    [`${side}_score`]: score,
    scorers,
    assists,
    match_status: opponentScore !== null && opponentScore !== undefined ? 'played' : fixture.match_status,
  };
  const { error } = await supabaseClient.from('football_fixtures').update(update).eq('id', id);
  if (error) {
    button.disabled = false;
    setDashboardMessage(`Could not save ${side} result: ${error.message}`, true);
    return;
  }
  setDashboardMessage(`${side === 'home' ? 'Home' : 'Away'} result saved${opponentScore !== null && opponentScore !== undefined ? ' and match marked played' : '; save the other side to complete the result'}.`);
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
      const isManual = playerInput.value === 'manual';
      const playerName = isManual
        ? row.querySelector('.manual-player-name').value.trim()
        : selected?.textContent.trim();
      if (!playerInput.value && !playerName) continue;
      if ((!isManual && !playerInput.value) || !playerName || !Number.isInteger(count) || count < 1) {
        setDashboardMessage('Choose a registered player or enter a player name, then enter a positive whole-number goal count for every scorer row.', true);
        return null;
      }
      total += count;
      const card = document.querySelector(`[data-admin-fixture="${CSS.escape(fixtureId)}"]`);
      const teamSide = ownGoal ? (side === 'home' ? 'away' : 'home') : side;
      const teamId = isManual
        ? card.dataset[`${teamSide}TeamId`]
        : selected.dataset.teamId;
      records.push({
        participant_id: isManual ? null : playerInput.value,
        team_id: teamId,
        player: playerName,
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
    const isManual = playerInput.value === 'manual';
    const playerName = isManual
      ? row.querySelector('.manual-player-name').value.trim()
      : selected?.textContent.trim();
    if (!playerInput.value && !playerName) continue;
    if ((!isManual && !playerInput.value) || !playerName || !Number.isInteger(count) || count < 1) {
      setDashboardMessage('Choose a registered player or enter a player name, then enter a positive whole-number assist count for every assist row.', true);
      return null;
    }
    total += count;
    const card = document.querySelector(`[data-admin-fixture="${CSS.escape(fixtureId)}"]`);
    records.push({
      participant_id: isManual ? null : playerInput.value,
      team_id: isManual ? card.dataset[`${side}TeamId`] : selected.dataset.teamId,
      player: playerName,
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
