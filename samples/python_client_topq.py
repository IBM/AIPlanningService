#! /usr/bin/env python

import sys
import json

def invoke_planner_service(domainfile, problemfile, k, q, category, planner_name):
    import requests

    post_url = 'http://localhost:4501/planners/' + category + '/' + planner_name
    with open(domainfile, "r") as d:
        task = {}
        task["domain"] = d.read()
        task["numplans"] = int(k)
        task["qualitybound"] = q
        with open(problemfile, "r") as p:
            task["problem"] = p.read()

        resp = requests.post(post_url, json=task)
        if resp.status_code != 200:
            raise Exception('POST %s {}'.format(resp.status_code) % post_url)

    return resp.json()


if __name__ == "__main__":
    category = "topq"
    planner_name = "iterative-unordered-topq"
    # planner_name = "kstar-topq"

    ret = invoke_planner_service(sys.argv[1], sys.argv[2], int(sys.argv[3]), float(sys.argv[4]), category, planner_name)
    
    print(json.dumps(ret, sort_keys=True, indent=4, separators=(',', ': ')))