#! /usr/bin/env python

import sys
import json

def invoke_planner_service(domainfile, problemfile, k, category, planner_name):
    import requests

    post_url = 'http://localhost:4501/planners/' + category + '/' + planner_name
    with open(domainfile, "r") as d:
        task = {}
        task["domain"] = d.read()
        task["numplans"] = int(k)
        with open(problemfile, "r") as p:
            task["problem"] = p.read()

        resp = requests.post(post_url, json=task)
        if resp.status_code != 200:
            raise Exception('POST %s {}'.format(resp.status_code) % post_url)

    return resp.json()


if __name__ == "__main__":
    category = "topk"
    planner_name = "kstar-topk"
    # planner_name = "iterative-topk"

    # category = "optimal"
    # planner_name = "delfi1"

    # category = "satisficing"
    # planner_name = "seq-sat-cerberus"

    # category = "agile"
    # planner_name = "seq-agl-cerberus"

    ret = invoke_planner_service(sys.argv[1], sys.argv[2], int(sys.argv[3]), category, planner_name)
    
    print(json.dumps(ret, sort_keys=True, indent=4, separators=(',', ': ')))