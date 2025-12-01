import os, sys, datetime
sys.path.append(os.getcwd())
from app import app, db  # noqa: E402

identifier = f"testsignup_{datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S')}@example.com"
password = "ExamplePass123!"
print("Testing signup for", identifier)

with app.test_client() as client:
    resp = client.post('/signup', data={'username': identifier, 'password': password})
    print('Signup status code:', resp.status_code)

log_path = os.path.join(os.getcwd(), 'data', 'system', 'activity.log')
print('Activity log path:', log_path)
if os.path.exists(log_path):
    with open(log_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()[-200:]
    matched = [ln.strip() for ln in lines if identifier in ln and 'signup_complete' in ln]
    print('Matched signup_complete entries:', len(matched))
    for ln in matched[-5:]:
        print('  ', ln[:500])
else:
    print('Activity log not found')
