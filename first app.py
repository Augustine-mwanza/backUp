


# imports
import sys
import base64
import csv
import json
import os
import re
import sqlite3
from contextlib import closing
from datetime import *
from itertools import combinations


from PyQt5.QtCore import *
from PyQt5.QtWidgets import *
from PyQt5.QtGui import QPixmap, QIcon, QPainter, QColor, QDesktopServices


class ParticipantTableWidget(QTableWidget):
    def keyPressEvent(self, event):
        control_pressed = bool(event.modifiers() & Qt.ControlModifier)
        if control_pressed and event.key() == Qt.Key_C:
            indexes = self.selectedIndexes()
            if not indexes and self.currentIndex().isValid():
                indexes = [self.currentIndex()]
            if indexes:
                top = min(index.row() for index in indexes)
                bottom = max(index.row() for index in indexes)
                left = min(index.column() for index in indexes)
                right = max(index.column() for index in indexes)
                selected = {(index.row(), index.column()) for index in indexes}
                rows = []
                for row in range(top, bottom + 1):
                    values = []
                    for column in range(left, right + 1):
                        item = self.item(row, column)
                        values.append(
                            item.text()
                            if (row, column) in selected and item is not None
                            else ""
                        )
                    rows.append("\t".join(values))
                QApplication.clipboard().setText("\n".join(rows))
            return

        if control_pressed and event.key() == Qt.Key_V:
            if self.editTriggers() == QAbstractItemView.NoEditTriggers:
                return
            clipboard_text = QApplication.clipboard().text()
            if not clipboard_text:
                return
            rows = clipboard_text.rstrip("\r\n").splitlines()
            if not rows:
                return
            start_row = self.currentRow()
            start_column = self.currentColumn()
            if start_row < 0:
                start_row = self.rowCount()
            if start_column < 0:
                start_column = 0
            for row_offset, line in enumerate(rows):
                values = [
                    re.sub(r"^\s*\d+[.)]\s*", "", value).strip()
                    for value in line.split("\t")
                ]
                target_row = start_row + row_offset
                if target_row >= self.rowCount():
                    self.insertRow(self.rowCount())
                for column_offset, value in enumerate(values):
                    target_column = start_column + column_offset
                    if target_column >= self.columnCount():
                        break
                    self.setItem(target_row, target_column, QTableWidgetItem(value))
            return

        super().keyPressEvent(event)


class MainWindow(QWidget):
    def __init__(self):
        super().__init__()
        background_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "google-home-background.jpg",
        )
        self.background_pixmap = QPixmap(background_path)

    def paintEvent(self, event):
        painter = QPainter(self)
        scaled_background = self.background_pixmap.scaled(
            self.size(), Qt.KeepAspectRatioByExpanding, Qt.SmoothTransformation
        )
        x = (scaled_background.width() - self.width()) // 2
        y = (scaled_background.height() - self.height()) // 2
        painter.drawPixmap(
            self.rect(),
            scaled_background,
            QRect(x, y, self.width(), self.height()),
        )
        painter.fillRect(self.rect(), QColor(0, 30, 0, 30))

# main app settings 

app = QApplication(sys.argv)
app.setOrganizationName("DeKUT")
app.setApplicationName("DeKUT-Comrades-App")
main_window = MainWindow()
main_window.setWindowTitle("DeKUT-Comrades App")
main_window.resize(500, 400)
main_window.setStyleSheet("color: blue;")

# Set app icon from a base64 data URL string
icon_data = "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"
if icon_data.startswith("data:image"):
    icon_data = icon_data.split(",", 1)[1]
icon_bytes = base64.b64decode(icon_data)
icon_path = r"C:\Users\PC\Downloads\app_icon.png"
with open(icon_path, "wb") as f:
    f.write(icon_bytes)
main_window.setWindowIcon(QIcon(icon_path))

# Creating app widgets/objects (e.g., buttons, etc.)
button1 = QPushButton("Students Portal")
button2 = QPushButton("DeKUT Catering")
button3 = QPushButton("E-Learning")
button4 = QPushButton("Helb Portal")
button5 = QPushButton("GeminiAI")
button6 = QPushButton("ChatGPT-AI")
button7 = QPushButton("Activities")
button_close = QPushButton("Close")
mukiti=QPushButton("Mukiti Developer           Mukiti developer                Mukiti Developer")

button1.clicked.connect(
    lambda: QDesktopServices.openUrl(QUrl("https://portal.dkut.ac.ke/"))
)
button2.clicked.connect(
    lambda: QDesktopServices.openUrl(QUrl("https://catering.dkut.ac.ke/"))
)
button3.clicked.connect(
    lambda: QDesktopServices.openUrl(QUrl("https://elearning.dkut.ac.ke/login/index.php"))
)
button4.clicked.connect(
    lambda: QDesktopServices.openUrl(QUrl("https://portal.hef.co.ke/auth/signin"))
)
button5.clicked.connect(
    lambda: QDesktopServices.openUrl(QUrl("https://gemini.google.com/app"))
)
button6.clicked.connect(
    lambda: QDesktopServices.openUrl(QUrl("https://chatgpt.com"))
)


def show_activities_table(activity_name=None):
    dialog = QDialog(main_window)
    dialog.setWindowTitle("Activities Registration")
    dialog.resize(850, 550)

    data_directory = QStandardPaths.writableLocation(QStandardPaths.AppDataLocation)
    database_path = os.path.join(data_directory, "activities.sqlite3")
    try:
        os.makedirs(data_directory, exist_ok=True)
        with closing(sqlite3.connect(database_path)) as connection, connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS activity_registrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    activity TEXT NOT NULL,
                    team_name TEXT NOT NULL,
                    gender TEXT NOT NULL,
                    coach TEXT NOT NULL,
                    participants TEXT NOT NULL,
                    group_name TEXT NOT NULL DEFAULT ''
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS football_match_dates (
                    gender TEXT NOT NULL,
                    group_name TEXT NOT NULL,
                    home_team TEXT NOT NULL,
                    away_team TEXT NOT NULL,
                    match_date TEXT NOT NULL DEFAULT '',
                    PRIMARY KEY (gender, group_name, home_team, away_team)
                )
                """
            )
            columns = {
                row[1]
                for row in connection.execute(
                    "PRAGMA table_info(activity_registrations)"
                )
            }
            if "group_name" not in columns:
                connection.execute(
                    "ALTER TABLE activity_registrations "
                    "ADD COLUMN group_name TEXT NOT NULL DEFAULT ''"
                )
    except (OSError, sqlite3.Error) as error:
        QMessageBox.critical(
            main_window,
            "Storage Error",
            f"Could not open the activities database:\n{error}",
        )
        return

    activity_columns = {
        "Football": [
            "Player Name",
            "Position",
            "Department",
            "Student Registration Number",
            "Player best foot",
        ],
        "Rugby": ["Player Name", "Position", "Year of Study", "Department"],
        "Handball": ["Player Name", "Position", "Year of Study", "Department"],
        "Softball": ["Player Name", "Position", "Year of Study", "Department"],
        "Hockey": ["Player Name", "Position", "Year of Study", "Department"],
        "Drama": ["Actor Name", "Role", "Year of Study", "Department"],
        "Volleyball": ["Player Name", "Position", "Year of Study", "Department"],
        "Music": ["Member Name", "Instrument", "Year of Study", "Department"],
        "AmericanBall": ["Player Name", "Position", "Year of Study", "Department"],
    }

    def show_football_group_matches():
        try:
            with closing(sqlite3.connect(database_path)) as connection, connection:
                registrations = connection.execute(
                    """
                    SELECT team_name, gender, group_name
                    FROM activity_registrations
                    WHERE activity = 'Football' AND TRIM(group_name) != ''
                    ORDER BY gender, UPPER(group_name), team_name COLLATE NOCASE
                    """
                ).fetchall()
        except sqlite3.Error as error:
            QMessageBox.critical(
                dialog, "Storage Error", f"Could not load football groups:\n{error}"
            )
            return

        groups = {}
        for team_name, gender, group_name in registrations:
            group_label = (gender, group_name.strip().upper())
            groups.setdefault(group_label, []).append(team_name)

        grouped_matches = [
            (
                gender,
                group_name,
                f"{gender} - Group {group_name}" if gender else f"Group {group_name}",
                list(combinations(teams, 2)),
            )
            for (gender, group_name), teams in groups.items()
            if len(teams) > 1
        ]
        if not grouped_matches:
            QMessageBox.information(
                dialog,
                "No Group Matches",
                "Save football teams with a group assigned before generating matches.",
            )
            return

        try:
            with closing(sqlite3.connect(database_path)) as connection, connection:
                saved_dates = {
                    (gender, group_name, home_team, away_team): match_date
                    for gender, group_name, home_team, away_team, match_date
                    in connection.execute(
                        """
                        SELECT gender, group_name, home_team, away_team, match_date
                        FROM football_match_dates
                        """
                    )
                }
        except sqlite3.Error as error:
            QMessageBox.critical(
                dialog, "Storage Error", f"Could not load match dates:\n{error}"
            )
            return

        matches_dialog = QDialog(dialog)
        matches_dialog.setWindowTitle("Football Group Matches")
        matches_dialog.resize(560, 800)
        layout = QVBoxLayout(matches_dialog)
        save_dates_button = QPushButton("Save Match Dates")
        layout.addWidget(save_dates_button)
        scroll_area = QScrollArea(matches_dialog)
        scroll_area.setWidgetResizable(True)
        groups_widget = QWidget()
        groups_layout = QVBoxLayout(groups_widget)
        date_fields = []
        for gender, group_name, group_label, matches in grouped_matches:
            heading = QLabel(group_label)
            heading.setStyleSheet("font-size: 16px; font-weight: bold;")
            groups_layout.addWidget(heading)

            match_table = QTableWidget(len(matches), 3, groups_widget)
            match_table.setHorizontalHeaderLabels(
                ["Home Team", "Away Team", "Match Date (Date-Month)"]
            )
            match_table.setEditTriggers(QAbstractItemView.NoEditTriggers)
            match_table.setAlternatingRowColors(True)
            match_table.verticalHeader().setDefaultSectionSize(34)
            match_table.setStyleSheet("QTableWidget { font-size: 12px; }")
            match_table.horizontalHeader().setSectionResizeMode(
                0, QHeaderView.Stretch
            )
            match_table.horizontalHeader().setSectionResizeMode(
                1, QHeaderView.Stretch
            )
            match_table.horizontalHeader().setSectionResizeMode(
                2, QHeaderView.ResizeToContents
            )
            for row, match in enumerate(matches):
                for column, team_name in enumerate(match):
                    match_table.setItem(row, column, QTableWidgetItem(team_name))
                date_field = QLineEdit(
                    saved_dates.get(
                        (gender, group_name, match[0], match[1]), ""
                    )
                )
                date_field.setPlaceholderText("Date-Month")
                date_field.setMinimumHeight(28)
                match_table.setCellWidget(row, 2, date_field)
                date_fields.append(
                    (gender, group_name, match[0], match[1], date_field)
                )
            match_table.setMinimumHeight(
                match_table.horizontalHeader().sizeHint().height()
                + len(matches) * match_table.verticalHeader().defaultSectionSize()
                + 8
            )
            groups_layout.addWidget(match_table)
        groups_layout.addStretch()
        scroll_area.setWidget(groups_widget)
        layout.addWidget(scroll_area)

        def save_match_dates():
            dates_to_save = []
            for gender, group_name, home_team, away_team, date_field in date_fields:
                match_date = date_field.text().strip()
                if match_date and QDate.fromString(
                    match_date, "Date-Month"
                ).toString("Date-Month") != match_date:
                    QMessageBox.warning(
                        matches_dialog,
                        "Invalid Date",
                        "Enter each match date as Date-Month.",
                    )
                    return
                dates_to_save.append(
                    (gender, group_name, home_team, away_team, match_date)
                )

            try:
                with closing(sqlite3.connect(database_path)) as connection, connection:
                    connection.executemany(
                        """
                        INSERT INTO football_match_dates
                            (gender, group_name, home_team, away_team, match_date)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT (gender, group_name, home_team, away_team)
                        DO UPDATE SET match_date = excluded.match_date
                        """,
                        dates_to_save,
                    )
            except sqlite3.Error as error:
                QMessageBox.critical(
                    matches_dialog,
                    "Storage Error",
                    f"Could not save match dates:\n{error}",
                )
                return
            QMessageBox.information(
                matches_dialog, "Dates Saved", "Match dates saved on this computer."
            )

        save_dates_button.clicked.connect(save_match_dates)
        matches_dialog.exec_()

    def make_activity_tab(activity, columns):
        tab = QWidget()
        tab_layout = QVBoxLayout(tab)
        selection_layout = QHBoxLayout()
        registration_selector = QComboBox()
        registration_selector.setMinimumWidth(220)
        edit_button = QPushButton("Edit Team")
        edit_button.setEnabled(False)
        new_button = QPushButton("New Registration")
        selection_layout.addWidget(QLabel("Saved registrations:"))
        selection_layout.addWidget(registration_selector, 1)
        selection_layout.addWidget(edit_button)
        selection_layout.addWidget(new_button)
        tab_layout.addLayout(selection_layout)

        details_layout = QFormLayout()
        group_field = None
        if activity == "Football":
            group_field = QLineEdit()
            group_field.setPlaceholderText("For example: A or Group 1")
            details_layout.addRow("Tournament Group:", group_field)

        name_field = QLineEdit()
        name_label = "Drama Name:" if activity == "Drama" else "Team Name:"
        details_layout.addRow(name_label, name_field)

        gender_field = None
        if activity not in ("Music", "Drama"):
            gender_field = QComboBox()
            gender_field.addItems(["Men", "Women"])
            details_layout.addRow("Team Gender:", gender_field)

        coach_field = QLineEdit()
        details_layout.addRow("Team Coach:", coach_field)

        table = ParticipantTableWidget(0, len(columns), tab)
        table.setHorizontalHeaderLabels(columns)
        table.setAlternatingRowColors(True)
        table.setEditTriggers(QAbstractItemView.AllEditTriggers)
        table.setSelectionMode(QAbstractItemView.ExtendedSelection)
        table.horizontalHeader().sectionClicked.connect(table.selectColumn)
        table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        table.setStyleSheet("QTableWidget { border: 4px solid green; }")
        table.setToolTip(
            "Click a column heading to select and copy that column with Ctrl+C. "
            "Click a starting cell and press Ctrl+V to paste a copied column. "
            "You can also copy and paste rows from a spreadsheet."
        )

        registration_heading = None
        coach_heading = None
        if activity == "Football":
            registration_heading = QLabel()
            registration_heading.setStyleSheet(
                "font-size: 20thispx; font-weight: bold;"
            )
            coach_heading = QLabel()
            tab_layout.addWidget(registration_heading)
            tab_layout.addWidget(coach_heading)

        buttons_layout = QHBoxLayout()
        add_button = QPushButton("Add Participant")
        remove_button = QPushButton("Remove Selected")
        submit_button = QPushButton("Submit Registration")
        export_button = QPushButton("Save to Device")
        export_button.setEnabled(False)
        matches_button = QPushButton("Generate Group Matches") if activity == "Football" else None
        add_button.clicked.connect(lambda _, t=table: t.insertRow(t.rowCount()))
        remove_button.clicked.connect(
            lambda _, t=table: t.removeRow(t.currentRow())
            if t.currentRow() >= 0
            else None
        )
        buttons_layout.addWidget(add_button)
        buttons_layout.addWidget(remove_button)
        if matches_button is not None:
            matches_button.clicked.connect(show_football_group_matches)
            buttons_layout.addWidget(matches_button)
        buttons_layout.addStretch()
        buttons_layout.addWidget(export_button)
        buttons_layout.addWidget(submit_button)

        saved_id = {"value": None}

        def clear_form():
            saved_id["value"] = None
            name_field.clear()
            coach_field.clear()
            if gender_field is not None:
                gender_field.setCurrentIndex(0)
            if group_field is not None:
                group_field.clear()
            update_registration_heading()
            table.setRowCount(0)
            edit_button.setEnabled(False)
            export_button.setEnabled(False)
            submit_button.setText("Submit Registration")
            set_form_editable(True)

        def set_form_editable(editable):
            name_field.setEnabled(editable)
            coach_field.setEnabled(editable)
            if gender_field is not None:
                gender_field.setEnabled(editable)
            if group_field is not None:
                group_field.setEnabled(editable)
            table.setEditTriggers(
                QAbstractItemView.AllEditTriggers
                if editable
                else QAbstractItemView.NoEditTriggers
            )
            add_button.setEnabled(editable)
            remove_button.setEnabled(editable)
            submit_button.setEnabled(editable)

        def edit_registration():
            if saved_id["value"] is None:
                return
            set_form_editable(True)
            edit_button.setEnabled(False)
            submit_button.setText("Save Changes")

        def update_registration_heading(*_):
            if registration_heading is not None:
                registration_heading.setText(name_field.text().strip().upper())
            if coach_heading is not None:
                coach = coach_field.text().strip()
                coach_heading.setText(f"Team Coach: {coach}" if coach else "")

        def start_new_registration():
            registration_selector.setCurrentIndex(-1)
            clear_form()

        def load_registration(index):
            registration_id = registration_selector.itemData(index)
            if registration_id is None:
                clear_form()
                return
            try:
                with closing(sqlite3.connect(database_path)) as connection, connection:
                    record = connection.execute(
                        """
                        SELECT team_name, gender, coach, participants, group_name
                        FROM activity_registrations
                        WHERE id = ? AND activity = ?
                        """,
                        (registration_id, activity),
                    ).fetchone()
            except sqlite3.Error as error:
                QMessageBox.critical(
                    dialog, "Storage Error", f"Could not load registration:\n{error}"
                )
                return
            if record is None:
                QMessageBox.critical(
                    dialog, "Storage Error", "The selected registration was not found."
                )
                return

            saved_id["value"] = registration_id
            edit_button.setEnabled(True)
            export_button.setEnabled(True)
            submit_button.setText("Submit Registration")
            set_form_editable(False)
            name_field.setText(record[0])
            coach_field.setText(record[2])
            if gender_field is not None:
                gender_field.setCurrentText(record[1] or "Men")
            if group_field is not None:
                group_field.setText(record[4] or "")
            update_registration_heading()
            try:
                participants = json.loads(record[3])
            except (TypeError, json.JSONDecodeError) as error:
                QMessageBox.critical(
                    dialog,
                    "Storage Error",
                    f"Could not read saved participants:\n{error}",
                )
                return
            table.setRowCount(0)
            for participant in participants:
                if activity == "Football":
                    if isinstance(participant, dict):
                        participant = [
                            participant.get("player_name", ""),
                            participant.get("position", ""),
                            participant.get("department", ""),
                            participant.get("registration_number", ""),
                        ]
                    elif len(participant) >= 4:
                        participant = [
                            participant[0],
                            participant[1],
                            participant[3],
                            "",
                        ]
                    else:
                        participant = list(participant[:3]) + [""]
                row = table.rowCount()
                table.insertRow(row)
                for column, value in enumerate(participant[:len(columns)]):
                    table.setItem(row, column, QTableWidgetItem(str(value)))

        def refresh_registrations(select_id=None):
            registration_selector.blockSignals(True)
            registration_selector.clear()
            try:
                with closing(sqlite3.connect(database_path)) as connection, connection:
                    records = connection.execute(
                        """
                        SELECT id, team_name, group_name
                        FROM activity_registrations
                        WHERE activity = ?
                        ORDER BY id DESC
                        """,
                        (activity,),
                    ).fetchall()
            except sqlite3.Error:
                registration_selector.blockSignals(False)
                raise
            for registration_id, team_name, group_name in records:
                label = team_name.strip() or "Untitled registration"
                if group_name.strip():
                    label = f"{label} - Group {group_name.strip().upper()}"
                registration_selector.addItem(
                    f"{label} (#{registration_id})", registration_id
                )
            selected_index = -1
            if select_id is not None:
                selected_index = registration_selector.findData(select_id)
            registration_selector.setCurrentIndex(selected_index)
            registration_selector.blockSignals(False)
            if selected_index >= 0:
                load_registration(selected_index)
            else:
                clear_form()

        def save_registration():
            team_name = name_field.text().strip()
            if not team_name:
                QMessageBox.warning(
                    dialog, "Missing Information", "Please enter a team or activity name."
                )
                return

            participants = []
            for row in range(table.rowCount()):
                values = [
                    table.item(row, column).text().strip()
                    if table.item(row, column) is not None
                    else ""
                    for column in range(table.columnCount())
                ]
                if any(values):
                    if activity == "Football":
                        participants.append(
                            {
                                "player_name": values[0],
                                "position": values[1],
                                "department": values[2],
                                "registration_number": values[3],
                            }
                        )
                        continue
                    participants.append(values)

            gender = gender_field.currentText() if gender_field is not None else ""
            group_name = (
                group_field.text().strip().upper() if group_field is not None else ""
            )
            registration_id = saved_id["value"]
            try:
                with closing(sqlite3.connect(database_path)) as connection, connection:
                    if registration_id is None:
                        cursor = connection.execute(
                            """
                            INSERT INTO activity_registrations
                                (activity, team_name, gender, coach, participants, group_name)
                            VALUES (?, ?, ?, ?, ?, ?)
                            """,
                            (
                                activity,
                                team_name,
                                gender,
                                coach_field.text().strip(),
                                json.dumps(participants),
                                group_name,
                            ),
                        )
                        registration_id = cursor.lastrowid
                    else:
                        connection.execute(
                            """
                            UPDATE activity_registrations
                            SET team_name = ?, gender = ?, coach = ?, participants = ?,
                                group_name = ?
                            WHERE id = ? AND activity = ?
                            """,
                            (
                                team_name,
                                gender,
                                coach_field.text().strip(),
                                json.dumps(participants),
                                group_name,
                                registration_id,
                                activity,
                            ),
                        )
            except sqlite3.Error as error:
                QMessageBox.critical(
                    dialog, "Storage Error", f"Could not save registration:\n{error}"
                )
                return

            saved_id["value"] = registration_id
            try:
                refresh_registrations(registration_id)
            except sqlite3.Error as error:
                QMessageBox.critical(
                    dialog, "Storage Error", f"Could not refresh registrations:\n{error}"
                )
                return
            registration_data = {
                "id": registration_id,
                "activity": activity,
                "team_name": team_name,
                "gender": gender,
                "group": group_name,
                "coach": coach_field.text().strip(),
                "participants": participants,
            }
            registration_files_directory = os.path.join(
                data_directory, "registrations"
            )
            registration_file = os.path.join(
                registration_files_directory,
                f"{activity.lower()}_{registration_id}.csv",
            )
            try:
                os.makedirs(registration_files_directory, exist_ok=True)
                with open(
                    registration_file, "w", encoding="utf-8-sig", newline=""
                ) as file:
                    writer = csv.writer(file)
                    writer.writerow(
                        [
                            "Activity",
                            "Team Name",
                            "Gender",
                            "Group",
                            "Coach",
                            *activity_columns[activity],
                        ]
                    )
                    if participants:
                        for participant in participants:
                            if activity == "Football" and isinstance(
                                participant, dict
                            ):
                                participant_values = [
                                    participant.get("player_name", ""),
                                    participant.get("position", ""),
                                    participant.get("department", ""),
                                    participant.get("registration_number", ""),
                                ]
                            else:
                                participant_values = participant
                            writer.writerow(
                                [
                                    registration_data["activity"],
                                    registration_data["team_name"],
                                    registration_data["gender"],
                                    registration_data["group"],
                                    registration_data["coach"],
                                    *participant_values,
                                ]
                            )
                    else:
                        writer.writerow(
                            [
                                registration_data["activity"],
                                registration_data["team_name"],
                                registration_data["gender"],
                                registration_data["group"],
                                registration_data["coach"],
                                *("" for _ in activity_columns[activity]),
                            ]
                        )
            except OSError as error:
                QMessageBox.critical(
                    dialog,
                    "File Save Error",
                    "The registration was saved in the app database, but its CSV file "
                    f"could not be written:\n{error}",
                )
                return
            QMessageBox.information(
                dialog,
                "Registration Saved",
                f"Registration saved as a CSV file:\n{registration_file}",
            )

        def export_registration():
            registration_id = saved_id["value"]
            if registration_id is None:
                QMessageBox.warning(
                    dialog,
                    "No Saved Registration",
                    "Submit the registration before saving a copy to your device.",
                )
                return
            try:
                with closing(sqlite3.connect(database_path)) as connection, connection:
                    record = connection.execute(
                        """
                        SELECT activity, team_name, gender, group_name, coach, participants
                        FROM activity_registrations
                        WHERE id = ? AND activity = ?
                        """,
                        (registration_id, activity),
                    ).fetchone()
            except sqlite3.Error as error:
                QMessageBox.critical(
                    dialog,
                    "Storage Error",
                    f"Could not load registration for export:\n{error}",
                )
                return
            if record is None:
                QMessageBox.critical(
                    dialog, "Storage Error", "The saved registration could not be found."
                )
                return
            try:
                participants = json.loads(record[5])
            except (TypeError, json.JSONDecodeError) as error:
                QMessageBox.critical(
                    dialog,
                    "Export Error",
                    f"Could not read the saved participants:\n{error}",
                )
                return
            safe_team_name = "".join(
                character
                if character.isalnum() or character in (" ", "-", "_")
                else "_"
                for character in record[1]
            ).strip().replace(" ", "_")
            default_filename = (
                f"{safe_team_name or 'registration'}_{activity.lower()}.csv"
            )
            file_path, _ = QFileDialog.getSaveFileName(
                dialog,
                "Save Registration to Your Device",
                default_filename,
                "CSV files (*.csv)",
            )
            if not file_path:
                return
            registration_data = {
                "id": registration_id,
                "activity": record[0],
                "team_name": record[1],
                "gender": record[2],
                "group": record[3],
                "coach": record[4],
                "participants": participants,
            }
            try:
                with open(file_path, "w", encoding="utf-8-sig", newline="") as file:
                    writer = csv.writer(file)
                    writer.writerow(
                        [
                            "Activity",
                            "Team Name",
                            "Gender",
                            "Group",
                            "Coach",
                            *activity_columns[activity],
                        ]
                    )
                    if participants:
                        for participant in participants:
                            if activity == "Football" and isinstance(
                                participant, dict
                            ):
                                participant_values = [
                                    participant.get("player_name", ""),
                                    participant.get("position", ""),
                                    participant.get("department", ""),
                                    participant.get("registration_number", ""),
                                ]
                            else:
                                participant_values = participant
                            writer.writerow(
                                [
                                    registration_data["activity"],
                                    registration_data["team_name"],
                                    registration_data["gender"],
                                    registration_data["group"],
                                    registration_data["coach"],
                                    *participant_values,
                                ]
                            )
                    else:
                        writer.writerow(
                            [
                                registration_data["activity"],
                                registration_data["team_name"],
                                registration_data["gender"],
                                registration_data["group"],
                                registration_data["coach"],
                                *("" for _ in activity_columns[activity]),
                            ]
                        )
            except OSError as error:
                QMessageBox.critical(
                    dialog,
                    "Export Error",
                    f"Could not save the registration file:\n{error}",
                )
                return
            QMessageBox.information(
                dialog,
                "Copy Saved",
                f"A CSV copy was saved to:\n{file_path}",
            )

        registration_selector.currentIndexChanged.connect(load_registration)
        edit_button.clicked.connect(edit_registration)
        new_button.clicked.connect(start_new_registration)
        submit_button.clicked.connect(save_registration)
        export_button.clicked.connect(export_registration)
        name_field.textChanged.connect(update_registration_heading)
        coach_field.textChanged.connect(update_registration_heading)

        tab_layout.addLayout(details_layout)
        tab_layout.addWidget(table)
        tab_layout.addLayout(buttons_layout)
        try:
            refresh_registrations()
        except sqlite3.Error as error:
            QMessageBox.critical(
                dialog, "Storage Error", f"Could not load registrations:\n{error}"
            )
        return tab

    if activity_name not in activity_columns:
        QMessageBox.warning(
            main_window,
            "Activity Not Found",
            f"No registration form is available for {activity_name!r}.",
        )
        return

    dialog.setWindowTitle(f"{activity_name} Registration")
    layout = QVBoxLayout(dialog)
    registration_frame = QFrame(dialog)
    registration_frame.setObjectName("registrationFrame")
    registration_frame.setStyleSheet(
        "QFrame#registrationFrame { border: 4px solid green; }"
    )
    frame_layout = QVBoxLayout(registration_frame)
    back_button = QPushButton("← Back to Activities")
    back_button.clicked.connect(lambda: (dialog.close(), show_activity_menu()))
    frame_layout.addWidget(back_button, alignment=Qt.AlignLeft)
    frame_layout.addWidget(
        make_activity_tab(activity_name, activity_columns[activity_name])
    )
    layout.addWidget(registration_frame)
    dialog.exec_()



def show_activity_menu():
    menu = QDialog(main_window)
    menu.setWindowTitle("Choose Activity")
    menu.resize(520, 360)
    menu_layout = QVBoxLayout(menu)

    greeting = QLabel("Good Morning!")
    greeting.setStyleSheet("font-size: 24px; font-weight: bold; color: darkgreen;")
    menu_layout.addWidget(greeting)

    intro = QLabel("Hello!\nWelcome to the Comrades App.\nChoose an activity below.")
    intro.setStyleSheet("font-size: 16px; color: #1b1b1b;")
    intro.setWordWrap(True)
    menu_layout.addWidget(intro)

    activity_buttons = [
        "Football",
        "Rugby",
        "Handball",
        "Softball",
        "Hockey",
        "Drama",
        "Volleyball",
        "Music",
        "AmericanBall",
    ]

    grid = QGridLayout()
    for idx, activity in enumerate(activity_buttons):
        btn = QPushButton(activity)
        btn.setStyleSheet(
            "background-color: #dfefff; color: #0f2d52; border: 2px solid #5a7ba6; "
            "border-radius: 10px; font-size: 14px; font-weight: bold; padding: 14px;"
        )

        def open_selected(selected_activity, button_obj=None):
            menu.close()
            show_activities_table(selected_activity)

        btn.clicked.connect(lambda checked=False, value=activity: open_selected(value))
        row, col = divmod(idx, 2)
        grid.addWidget(btn, row, col)

    menu_layout.addLayout(grid)
    menu_layout.addStretch()
    menu.exec_()



button_close.clicked.connect(main_window.close)
button7.clicked.connect(show_activity_menu)
mukiti.setSizePolicy(QSizePolicy.Expanding,QSizePolicy.Fixed)
mukiti.setAttribute(Qt.WA_TransparentForMouseEvents,True)
mukiti.setFocusPolicy(Qt.NoFocus)

button1.setStyleSheet("background-color: green; color: white; border: 3px solid gray;font-weight:bold;font-size:16px; border-radius: 12px; padding: 12px 20px; min-width: 160px;")
button2.setStyleSheet("background-color: green; color: white; border: 3px solid gray;font-weight:bold; border-radius: 12px;font-size:16px; padding: 10px 16px; min-width: 120px;")
button3.setStyleSheet("background-color: green; color:white; border: 3px solid gray; font-weight:bold;border-radius: 12px;font-size:16px; padding: 10px 16px; min-width: 120px;")
button4.setStyleSheet("background-color: green; color:white; border: 3px solid gray; border-radius: 12px; padding: 10px 16px;font-size:16px;font-weight:bold; min-width: 180px;")
button5.setStyleSheet("background-color: green; color: white; border: 3px solid gray; border-radius: 12px;font-weight:bold;font-size:16px; padding: 10px 16px; min-width: 160px;")
button6.setStyleSheet("background-color: green; color: white; border: 3px solid gray; border-radius: 12px;font-weight:bold;font-size:16px; padding: 10px 16px; min-width: 160px;")
button7.setStyleSheet("background-color: red; color: white; border: 3px solid gray; border-radius: 12px;font-weight:bold;font-size:16px; padding: 10px 16px; min-width: 160px;")
button_close.setStyleSheet("background-color: red; color: white; border: 3px solid gray; border-radius: 12px;font-weight:bold;font-size:12px; padding: 2px 5px; min-width: 40px;")
mukiti.setStyleSheet("background-color: rgb(255,99,71); color: rg(); border: 3px solid gray; border-radius: 2px;font-weight:light;font-size:8px; min-width: 20px;")

# all design here

row1 = QVBoxLayout()
row2 = QHBoxLayout()
row3 = QHBoxLayout()
row4= QHBoxLayout()
row5=QHBoxLayout()

time_now = QLabel("Good Morning!")
time_now.setStyleSheet("color:rgb(0,100,0);font-size:24px; font-weight:bold")

welcome_label = QLabel("Hello!\n Welcome to Comrades App.\n Enjoy the services. ")
welcome_label.setStyleSheet("color: rgb(0,100,0); font-size: 18px; font-weight: bold;")


def update_time_label():
    hour = datetime.now().hour
    if 5 <= hour < 12:
        time_now.setText("Good Morning!")
    elif 12 <= hour < 17:
        time_now.setText("Good Afternoon!")
    elif 17 <= hour < 21:
        time_now.setText("Good Evening!")
    else:
        time_now.setText("Good Night!")


update_time_label()

time_timer = QTimer()
time_timer.timeout.connect(update_time_label)
time_timer.start(60000)

row1.addWidget(time_now,alignment=Qt.AlignCenter)
row1.addWidget(welcome_label, alignment=Qt.AlignLeft)
row3.addWidget(button5, alignment=Qt.AlignLeft)
row3.addWidget(button6, alignment=Qt.AlignLeft)

row1.addWidget(button1, alignment=Qt.AlignLeft)
row1.addWidget(button2,alignment=Qt.AlignLeft)
row1.addWidget(button3,alignment=Qt.AlignLeft)
row1.addWidget(button4,alignment=Qt.AlignLeft)
row3.addWidget(button7,alignment=Qt.AlignLeft)
row4.addWidget(button_close, alignment=Qt.AlignRight)
row5.addWidget(mukiti)
row5.setContentsMargins(0,0,0,0)


main_layout = QVBoxLayout()
main_layout.addLayout(row1)
main_layout.addLayout(row2)
main_layout.addLayout(row3)
main_layout.addLayout(row4)
main_layout.addLayout(row5)

main_window.setLayout(main_layout)

main_window.show()

sys.exit(app.exec_())