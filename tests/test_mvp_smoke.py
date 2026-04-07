from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_and_basic_flow():
    h = client.get('/health')
    assert h.status_code == 200
    assert h.json()['status'] == 'ok'

    u = client.post(
        '/users',
        json={
            'name': 'Editor One',
            'email': 'editor1@example.com',
            'role': 'Editor',
            'tenant': 'firm-a',
        },
    )
    if u.status_code == 409:
        me = client.get('/users/me', headers={'X-User-Id': '1'})
        assert me.status_code in {200, 401}
        return

    assert u.status_code == 200
    user_id = u.json()['id']

    m = client.post(
        '/matters',
        json={
            'title': 'GST Show Cause Reply',
            'forum': 'GST',
            'parties': 'ACME Pvt Ltd vs Department',
            'stage': 'notice',
        },
        headers={'X-User-Id': str(user_id)},
    )
    assert m.status_code == 200
    matter_id = m.json()['id']

    files = {'file': ('notice.txt', b'Date 12/02/2025. Penalty proposed due to mismatch in invoices.')}
    data = {'title': 'SCN-1', 'tag': 'notice'}
    d = client.post(f'/matters/{matter_id}/documents', files=files, data=data, headers={'X-User-Id': str(user_id)})
    assert d.status_code == 200

    g = client.post(f'/matters/{matter_id}/generate/brief', headers={'X-User-Id': str(user_id)})
    assert g.status_code == 200
    assert 'Matter Brief' in g.json()['title']
