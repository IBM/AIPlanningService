#!/bin/bash

# $1 domain
# $2 problem
# $3 number of plans (k)
# $4 output

num_plans=$(( 2*$3 ))

SOURCE="$( dirname "${BASH_SOURCE[0]}" )"
$SOURCE/plan.py --planner diverse --domain $1 --problem $2 --number-of-plans $num_plans --use-local-folder --clean-local-folder

PLANSDIR=$(pwd)/found_plans
num_plans=`ls -1q $PLANSDIR/sas_plan.* | wc -l`

SCORE="subset(compute_stability_metric=true,aggregator_metric=avg,plans_as_multisets=false,plans_subset_size=$3,exact_method=false,dump_plans=true)"
domain="$(cd "$(dirname "$1")"; pwd)/$(basename "$1")"
problem="$(cd "$(dirname "$2")"; pwd)/$(basename "$2")"

(mkdir -p $PLANSDIR/done && cd $PLANSDIR/done && $DIVERSE_SCORE_COMPUTATION_PATH/fast-downward.py $domain $problem --diversity-score $SCORE --internal-plan-files-path $PLANSDIR --internal-num-plans-to-read $num_plans)

$SOURCE/../plans_to_json.py --domain $1 --problem $2 --plans-folder $PLANSDIR/done --plan-file sas_plan --json-file $4
