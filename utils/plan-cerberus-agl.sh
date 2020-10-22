#!/bin/bash

# $1 domain
# $2 problem
# $3 plan file
# $4 json file

LOG_FILE=run.log
SOURCE="$( dirname "${BASH_SOURCE[0]}" )"

$SOURCE/plan-agl.py $1 $2 $3 > $LOG_FILE
$SOURCE/../plans_to_json.py --domain $1 --problem $2 --plans-folder . --plan-file $3 --json-file $4
