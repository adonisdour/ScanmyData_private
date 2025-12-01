import urllib.request, urllib.error
url = 'http://127.0.0.1:5001/api/admin/activity-logs?limit=5'
req = urllib.request.Request(url, headers={'Accept': 'application/json'})
try:
    resp = urllib.request.urlopen(req, timeout=5)
    print('STATUS', resp.getcode())
    print(resp.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print('STATUS', e.code)
    try:
        print(e.read().decode('utf-8'))
    except Exception:
        print('<no body>')
except Exception as ex:
    print('ERROR', ex)
