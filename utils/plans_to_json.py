#! /usr/bin/env python

import argparse

import json,sys
import os
import glob
import re


def create_plan_from_file(plan_file):
    with open(plan_file) as f:
        content = f.readlines()    
    content = [x.strip() for x in content] 
    actions = [x[1:-1] for x in content if x.startswith("(")]
    cost = [x for x in content if not x.startswith("(") and "cost" in x]
    ## Assuming for now only one such entry
    assert(len(cost) == 1)
    q = re.findall(r'; cost = (\d+)', cost[0], re.M)
    plan_cost = q[0]

    return { 'actions' : actions, 'cost' : plan_cost }


def main(args):
    plan_file_name = args.plan_file+"*"
    plan_files = glob.glob(os.path.join(args.plans_folder, plan_file_name))

    unique_plans = set()
    plans = []
    for plan_file in plan_files:
        plan = create_plan_from_file(plan_file)
        if plan is not None:
            actions_tuple = tuple(plan['actions'])
            if actions_tuple not in unique_plans:
                unique_plans.add(actions_tuple)
                plans.append(plan)

    with open(args.json_file, "w") as f:
        ## dumping plans into one json
        d = {  "plans": plans }
        json.dump(d, f, indent=4, sort_keys=True)



if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        add_help=False)
 
    parser.add_argument("--domain")
    parser.add_argument("--problem")
    parser.add_argument("--plans-folder")
    parser.add_argument("--plan-file")
    parser.add_argument("--json-file")

    args = parser.parse_args()
    main(args)
