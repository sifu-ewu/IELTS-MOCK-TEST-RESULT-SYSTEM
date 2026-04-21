"""Generate a test Excel file matching the screenshot for verifying the TRF generator."""
from openpyxl import Workbook

wb = Workbook()
ws = wb.active
ws.title = "Mock_March"

headers = ["Student Name", "Number", "E-Mail", "Seat", "L", "R", "W", "S", "Overall"]
ws.append(headers)

rows = [
    ["Christa Ghosh Rose",   "01344457107", "kimchristarose@gmail.com",      1,  5.5, 4.5, 2.5, 5.5, 4.5],
    ["Mushfika Akter",       "01829436005", "mushfikaakter296@gmail.com",    2,  5,   3.5, 4.5, "",  ""],
    ["Afsana Islam Rukiya",  "01403753989", "afsu8585@gmail.com",            3,  "",  "",  "",  "",  ""],
    ["Md. Easin",            "01940164438", "Eyasin8990@gmail.com",          4,  5.5, 4,   2.5, "",  ""],
    ["Nabil Hossain",        "01811208626", "nabilhossain97895@gmail.com",   5,  7.5, 4.5, 3,   "",  ""],
    ["Md. Tohidul Islam Shanto", "01972277149", "shantokhan20066@gmail.com", 6, 4,   3.5, 2.5, "",  ""],
    ["Maain Khandaker",      "01709509782", "maainkhandaker980@gmail.com",   7,  4.5, 4,   3.5, "",  ""],
    ["Sumaiya Afrin",        "01750505734", "afrinsumaiya472@gmail.com",     8,  4.5, 4.5, 3,   "",  ""],
    ["Ariyan Ahmed",         "01959336175", "ariyan05005@gmail.com",         9,  "",  "",  "",  "",  ""],
    ["Tanzid Hasan",         "01521566301", "tanzidhasan8@gmail.com",        10, "",  "",  "",  "",  ""],
    ["Sharmin Akter Sorna",  "01836555600", "mdatikurrahman01234@gmail.com", 11, 5.5, 4.5, "x", "",  ""],
    ["Sumaiya Akter",        "01902324325", "sumaiyasowrov678@gmail.com",    12, 4.5, 4,   3.5, "",  ""],
    ["Farhana Akter Santi",  "01971257158", "santifarhanaakter@gmail.com",   13, 4,   2,   "x", "",  ""],
    ["Israt Jahan Nabila",   "01609060696", "ij227094@gmail.com",            14, 6.5, 4.5, 3.5, 5,   5],
]
for row in rows:
    ws.append(row)

out = "g:/ielts Result/test_batch.xlsx"
wb.save(out)
print("Wrote", out)
