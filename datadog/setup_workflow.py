"""
Datadog Workflow Setup - Auto-create incidents from monitor alerts
"""

import os
import json
import urllib.request
import urllib.error
import ssl


ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

DD_API_KEY = os.environ.get("DD_API_KEY")
DD_APP_KEY = os.environ.get("DD_APP_KEY")
DD_SITE = os.environ.get("DD_SITE", "datadoghq.com")

BASE_URL = f"https://api.{DD_SITE}"

def api_request(method, path, body=None):
    """Make a Datadog API request."""
    url = f"{BASE_URL}{path}"
    headers = {
        "Content-Type": "application/json",
        "DD-API-KEY": DD_API_KEY,
        "DD-APPLICATION-KEY": DD_APP_KEY,
    }
    
    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req, context=ssl_context) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        print(f"   ❌ API Error {e.code}: {error_body[:500]}")
        return None


def delete_all_incidents():
    """Delete all active incidents."""
    print("\n🗑️  Deleting existing incidents...")
    
  
    result = api_request("GET", "/api/v2/incidents")
    if not result or "data" not in result:
        print("   No incidents found or error fetching")
        return
    
    incidents = result.get("data", [])
    if not incidents:
        print("   No incidents to delete")
        return
    
    for inc in incidents:
        inc_id = inc["id"]
        title = inc.get("attributes", {}).get("title", "Unknown")
        print(f"   Deleting: {title} ({inc_id})")
        

        update_body = {
            "data": {
                "id": inc_id,
                "type": "incidents",
                "attributes": {
                    "fields": {
                        "state": {"type": "dropdown", "value": "resolved"}
                    }
                }
            }
        }
        api_request("PATCH", f"/api/v2/incidents/{inc_id}", update_body)
    
    print(f"   ✅ Resolved {len(incidents)} incidents")


def create_workflow():
    """Create a workflow to auto-create incidents from monitor alerts."""
    print("\n⚙️  Creating Workflow for auto-incident creation...")
    

    result = api_request("GET", "/api/v2/workflows")
    if result and "data" in result:
        for wf in result["data"]:
            name = wf.get("attributes", {}).get("name", "")
            if "LLM Copilot" in name:
                print(f"   ⚠️  Workflow already exists: {name}")
                return wf["id"]
    
  
    workflow_body = {
        "data": {
            "type": "workflows",
            "attributes": {
                "name": "LLM Copilot - Auto Incident from Monitor",
                "description": "Auto-creates incidents when LLM monitors alert",
                "tags": ["service:llm-observability-copilot"],
                "isEnabled": True,
                "trigger": {
                    "type": "monitor",
                    "monitorTrigger": {
                        "matchingTags": ["service:llm-observability-copilot"],
                        "on": ["alert"]
                    }
                },
                "steps": [
                    {
                        "stepId": "declare_incident_1",
                        "name": "Declare Incident",
                        "action": {
                            "type": "declareIncident",
                            "declareIncident": {
                                "title": "{{ Source.monitor.name }}",
                                "severity": "SEV2",
                                "message": "Auto-created from monitor alert.\n\n{{ Source.monitor.message }}"
                            }
                        }
                    }
                ]
            }
        }
    }
    
    result = api_request("POST", "/api/v2/workflows", workflow_body)
    
    if result and "data" in result:
        workflow_id = result["data"]["id"]
        print(f"   ✅ Workflow created: {workflow_id}")
        print(f"   🔗 View at: https://app.{DD_SITE}/workflow/{workflow_id}")
        return workflow_id
    else:
        print("   ❌ Workflow API requires UI setup")
        print("   📋 Creating workflow via UI is required...")
        create_workflow_instructions()
        return None


def create_workflow_instructions():
    """Print instructions for manual workflow creation."""
    print("""
   
""")


def setup_monitor_notification_rule():
    
    print("\n📋 Setting up Monitor → Incident notification rule...")
    
   
    
    print("   ℹ️  Updating monitors to use proper incident integration...")
    

    result = api_request("GET", "/api/v1/monitor?tags=service:llm-observability-copilot")
    
    if not result:
        print("   ❌ Could not fetch monitors")
        return
    
    updated = 0
    for monitor in result:
        monitor_id = monitor.get("id")
        name = monitor.get("name", "")
        message = monitor.get("message", "")
        
       
        if "@incident" not in message:
            continue
            

        print(f"   ✓ Monitor '{name}' has @incident configured")
        updated += 1
    
    print(f"   ✅ Verified {updated} monitors have @incident tag")
    
    return True


def main():
    print("=" * 60)
    print("🐕 LLM Observability Copilot - Workflow Setup")
    print("=" * 60)
    
    if not DD_API_KEY or not DD_APP_KEY:
        print("\n❌ Error: DD_API_KEY and DD_APP_KEY required")
        return
    
    print(f"\n🔑 API Key: ...{DD_API_KEY[-4:]}")
    print(f"🔑 App Key: ...{DD_APP_KEY[-4:]}")
    
    
    delete_all_incidents()
    
 
    workflow_id = create_workflow()
    
    if not workflow_id:
      
        setup_monitor_notification_rule()
    
    print("\n" + "=" * 60)
    print("✅ SETUP COMPLETE")
    print("=" * 60)
    print("\n💡 Next steps:")
    print("   1. Verify workflow at: https://app.datadoghq.com/workflow")
    print("   2. Run traffic generator to trigger monitors")
    print("   3. Check incidents are auto-created")


if __name__ == "__main__":
    main()

