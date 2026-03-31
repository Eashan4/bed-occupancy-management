import sqlite3
for row in sqlite3.connect('hospital_iot.db').execute("SELECT device_id, api_key FROM devices"):
    print(row)
