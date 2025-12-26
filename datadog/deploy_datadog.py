"""
Datadog Dashboard, Monitors, and SLO Deployment Script

This script programmatically creates:
- Executive Dashboard for LLM Observability
- Pre-configured Monitors with alerting
- Service Level Objectives (SLOs)

Usage:
    export DD_API_KEY=your_api_key
    export DD_APP_KEY=your_app_key
    python deploy_datadog.py

Requirements:
    pip install datadog-api-client
"""

import os
import json
import sys
from pathlib import Path

try:
    from datadog_api_client import ApiClient, Configuration
    from datadog_api_client.v1.api.dashboards_api import DashboardsApi
    from datadog_api_client.v1.api.monitors_api import MonitorsApi
    from datadog_api_client.v1.api.service_level_objectives_api import ServiceLevelObjectivesApi
    from datadog_api_client.v1.model.dashboard import Dashboard
    from datadog_api_client.v1.model.monitor import Monitor
    from datadog_api_client.v1.model.service_level_objective_request import ServiceLevelObjectiveRequest
except ImportError:
    print("❌ Missing dependency. Install with: pip install datadog-api-client")
    sys.exit(1)


def load_json(filename: str) -> dict:
    """Load JSON configuration file."""
    path = Path(__file__).parent / filename
    with open(path) as f:
        return json.load(f)


def create_dashboard(api_client: ApiClient) -> str:
    """Create the LLM Observability Dashboard."""
    print("📊 Creating Dashboard...")
    
    api = DashboardsApi(api_client)
    config = load_json("dashboard.json")
    
    try:
        existing = api.list_dashboards()
        for dash in existing.dashboards:
            if dash.title == config["title"]:
                print(f"   ⚠️  Dashboard '{config['title']}' already exists. Updating...")
                response = api.update_dashboard(dash.id, body=config)
                print(f"   ✅ Updated: https://app.datadoghq.com/dashboard/{response.id}")
                return response.id
        
        response = api.create_dashboard(body=config)
        print(f"   ✅ Created: https://app.datadoghq.com/dashboard/{response.id}")
        return response.id
    except Exception as e:
        print(f"   ❌ Dashboard error: {e}")
        raise


def create_monitors(api_client: ApiClient) -> list:
    """Create or update all pre-configured monitors."""
    print("\n🔔 Creating/Updating Monitors...")
    
    api = MonitorsApi(api_client)
    config = load_json("monitors.json")
    created_ids = []
    updated_count = 0
    
  
    existing = api.list_monitors()
    existing_map = {m.name: m.id for m in existing}
    
    for monitor_config in config["monitors"]:
        name = monitor_config["name"]
        
        if name in existing_map:
           
            try:
                monitor_id = existing_map[name]
                api.update_monitor(monitor_id, body=monitor_config)
                updated_count += 1
                print(f"   🔄 Updated: {name}")
            except Exception as e:
                print(f"   ❌ Failed to update '{name}': {e}")
            continue
        
        try:
            response = api.create_monitor(body=monitor_config)
            created_ids.append(response.id)
            print(f"   ✅ Created: {name}")
        except Exception as e:
            print(f"   ❌ Failed to create '{name}': {e}")
    
    print(f"   📈 Monitors created: {len(created_ids)}, updated: {updated_count}")
    return created_ids


def create_slos(api_client: ApiClient) -> list:
    """Create Service Level Objectives."""
    print("\n🎯 Creating SLOs...")
    
    api = ServiceLevelObjectivesApi(api_client)
    config = load_json("slos.json")
    created_ids = []
    
 
    try:
        existing = api.list_slos()
        existing_names = {s.name for s in existing.data} if existing.data else set()
    except Exception:
        existing_names = set()
    
    for slo_config in config["slos"]:
        name = slo_config["name"]
        
        if name in existing_names:
            print(f"   ⚠️  SLO '{name}' already exists. Skipping.")
            continue
        
        try:
            response = api.create_slo(body=slo_config)
            if response.data:
                created_ids.append(response.data[0].id)
            print(f"   ✅ Created: {name}")
        except Exception as e:
            print(f"   ❌ Failed to create '{name}': {e}")
    
    print(f"   🎯 Total SLOs created: {len(created_ids)}")
    return created_ids


def main():
    """Main deployment function."""
    print("=" * 60)
    print("🐕 LLM Observability Copilot - Datadog Deployment")
    print("=" * 60)
    

    api_key = os.environ.get("DD_API_KEY")
    app_key = os.environ.get("DD_APP_KEY")
    
    if not api_key:
        print("\n❌ Error: DD_API_KEY environment variable not set")
        print("   Export your Datadog API key: export DD_API_KEY=your_key")
        sys.exit(1)
    
    if not app_key:
        print("\n❌ Error: DD_APP_KEY environment variable not set")
        print("   Export your Datadog App key: export DD_APP_KEY=your_key")
        print("   Create one at: https://app.datadoghq.com/organization-settings/application-keys")
        sys.exit(1)
    
  
    configuration = Configuration()
    configuration.api_key["apiKeyAuth"] = api_key
    configuration.api_key["appKeyAuth"] = app_key
    

    dd_site = os.environ.get("DD_SITE", "datadoghq.com")
    if dd_site != "datadoghq.com":
        configuration.server_variables["site"] = dd_site
        print(f"\n🌍 Using Datadog site: {dd_site}")
    
    print(f"\n🔑 API Key: ...{api_key[-4:]}")
    print(f"🔑 App Key: ...{app_key[-4:]}")
    
    with ApiClient(configuration) as api_client:
        try:
    
            dashboard_id = create_dashboard(api_client)
            monitor_ids = create_monitors(api_client)
            slo_ids = create_slos(api_client)
            
        
            print("\n" + "=" * 60)
            print("✅ DEPLOYMENT COMPLETE")
            print("=" * 60)
            print(f"\n📊 Dashboard: https://app.datadoghq.com/dashboard/{dashboard_id}")
            print(f"🔔 Monitors: {len(monitor_ids)} created")
            print(f"🎯 SLOs: {len(slo_ids)} created")
            print("\n💡 Next steps:")
            print("   1. Open your dashboard in Datadog")
            print("   2. Send some test requests to your LLM API")
            print("   3. Watch metrics populate in real-time!")
            
        except Exception as e:
            print(f"\n❌ Deployment failed: {e}")
            sys.exit(1)


if __name__ == "__main__":
    main()

