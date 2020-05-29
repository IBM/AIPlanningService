#!/bin/bash

domain=`sed 's/;/\n;/g' $1 | sed '/^;/d' | tr -d '\n'`
problem=`sed 's/;/\n;/g' $2 | sed '/^;/d' | tr -d '\n'`
body="{\"domain\": \"$domain\", \"problem\": \"$problem\", \"numplans\":$3}"
basebody=`echo $body`
curl -d "$basebody" -H "Content-Type: application/json" http://localhost:4501/planners/topk
