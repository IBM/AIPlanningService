#!/bin/bash
domain=`tr -d '\n' < $1`
problem=`tr -d '\n' < $2`
body="{\"domain\": \"$domain\", \"problem\": \"$problem\", \"numplans\":$3}"
basebody=`echo $body`
curl -d "$basebody" -H "Content-Type: application/json" http://localhost:4501/planners/topk
