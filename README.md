# Planning service

The repository contains a docker configuration file and code that allow fetching, building, and deploying a service with the following open-source planners
1. Delfi1, the winner of the sequential optimal track of IPC2018
2. Cerberus, participant in satisficing and agile tracks of IPC2018
3. ForbidIterative suite of top-k, top-quality, and diverse planners
4. K* based top-k planner

## Build and run the service
* Two-stage build via ```docker build -t <YOUR_IMAGE_TAG> -f Dockerfile.twostage .```
* Run the service locally via ```docker run -d -p 4501:4501 --env server__hostname=`hostname`:4501 --name <YOUR_CONTAINER_NAME> <YOUR_IMAGE_TAG>```. A couple of notes:
    * This will make the service available on your local machine on port 4501. See the Docker User Guide for manipulating port mappings and binding to specific interfaces.
    * The ```--env``` options are only necessary for the swagger UI available at (http://localhost:4501/api-docs) to properly bind to your physical host name and port instead of the container name. If you do not plan to use the swagger UI, you can safely skip it.

## Use the service
* A swagger UI is available at http://<YOUR_HOSTNAME>:4501/. Please note you should use your actual host name and not localhost, as the browser will prevent calls from going through.
* For a simple command line sample, run ```samples/curl_client.sh samples/domain1.pddl samples/problem1.pddl 5``` for an example.
* If you are interested in a Python client, run ```python samples/python_client.py samples/domain1.pddl samples/problem1.pddl 5``` for an example.
* If you are interested in a JavaScript client, run (you need Node.js v12+ installed) ```node samples/js_client.js samples/domain1.pddl samples/problem1.pddl 5``` for an example.
* You can get a different client using the Swagger specification in ```samples/sample_swagger_doc.json``` (note the actual service specification is dynamically generated based on the configuration). You can then use either [Swagger Codegen](https://github.com/swagger-api/swagger-codegen) or the online [Swagger Editor](https://editor.swagger.io) to generate a client in your language of choice.

## Using alternate storage for processed requests
By default, requests received by the service will be stored to the local file system under ```/tmp```. Each request will contain a zip of the original planning task and of the returned response,
as well as the console and error logs, if any. Users of the service can choose not to store their request by using the **dontstore** URL parameter. 

You do have the option of configuring different type of storage for your processed requests as follows:
* In ```config/default-unified.json```, change the ```type``` attribute to something that uniquely identifies your storage method. As an example, let's assume this is ```cloud```.
* Define a new module called ```storage/cloud.js```. Define and implement one exported function as follows: ```exports.store = function(filepath, destfname, args) { ... }```. The arguments are:
    - ```filepath``` is the local path to the file containing the request and response as a zip when this method is called. You may need to upload, copy, etc. this file depending on your storage methodology.
    - ```destfname``` is a suggested destination file/bucket/topic/etc... name. You can use this to retrieve the file in the future, or completely ignore it and produce your own. This is guaranteed to be unique while the service is running continuously.
    - ```args``` is a copy of the ```args``` object you define in ```config/default-unified.json``` under ```storage::args```. You can pass anything you like here to configure your storage service, e.g., cloud IAM credentials, URLs, tokens, etc. - your function needs to interpret this in a meaningful way.
* You can completely disable storage of requests/responses by removing the ```storage``` entry in ```config/default-unified.json```.

## Logfiles
By default, logfiles are output to the console (the current Dockerfile runs the service with a logging level of ```debug```), as well as to the file specified in ```config/default-unified.json``` under ```logging```. Use the ```docker logs``` comand to get the latest, or set up a container log monitoring service of your choosing.
