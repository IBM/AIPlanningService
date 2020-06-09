var express = require('express');
var nconf = require('./conf');
var Promise = require('bluebird');
var _ = require('lodash');
var path = require('path');
var fs = require('mz/fs');
var util = require('util');
var bodyparser = require('body-parser');
var tmp = require('tmp-promise');
var childproc = require('child-process-promise').exec;
var apibase = require('./apibase.masterppp.json');
const swaggerUI = require('swagger-ui-express');
var archiver = require('archiver-promise');
var Sugar = require('sugar');
const log4js = require("log4js");
var timeout = require('connect-timeout')

log4js.configure(nconf.get("logging"));

module.exports.coreApiBase = function() {
    let dom = fs.readFileSync('samples/domain1.pddl', 'utf-8');
    let prob = fs.readFileSync('samples/problem1.pddl', 'utf-8');
    let sampledata = {
        domain: dom,
        problem: prob,
        numplans: 5,
        qualitybound: 1.0
    };
    apibase.definitions["PlanningTask"].example = sampledata;
    return apibase;
};

module.exports.getLogger = function(name) { 
    return log4js.getLogger(name);
}

module.exports.getOpenAPIDescription = function(pname) {
    return {
        "post": {
            "description": "Executes " + pname + " on a planning task and returns resulting plan",
            "operationId": pname,
            "consumes": ["application/json"],
            "parameters": [{
                "name": "task",
                "in": "body",
                "description": "the planning task",
                "schema": {
                    "$ref": "#/definitions/PlanningTask"
                }
            }],
            "responses": {
                "200": {
                    "description": "resulting plan",
                    "schema": {
                        "$ref": "#/definitions/PlanningResultMultiple"
                    }
                },
                "default": {
                    "description": "unexpected error",
                    "schema": {
                        "type": "string"
                    }
                }
            }
        }
    };
};

var storage_opt = nconf.get("storage");

function readPlannerOutput(procoutput, path, logger) {
    logger.info("Reading planner output from path " + path);
    return fs.readFile(path, 'utf-8').then(content => {
        logger.info("Content is: " + content);
        let objcontent = JSON.parse(content);
        objcontent.raw_output = JSON.stringify(procoutput, null, 2);
        return objcontent;
    });
}

function runAndCatch(command, timeout) {
    return childproc(command, {timeout: timeout})
    .catch(err => {
        return Promise.resolve(err);
    });
}

function runPlanner(pname, pconfig, domain, problem, dontstore, numplans, qualitybound, logger) {
    var p_tmpFiles = [
        tmp.tmpName({ template: '/tmp/domain-XXXXXX' }),
        tmp.tmpName({ template: '/tmp/problem-XXXXXX' }),
        tmp.tmpName({ template: '/tmp/plan-XXXXXX' }),
        tmp.tmpName({ template: '/tmp/task-XXXXXX.zip' }),
        tmp.tmpName({ template: '/tmp/sas_plan-XXXXXX' })
    ];

    return Promise.all(p_tmpFiles)
        .then(filenames => {
            var p_writeDomProb = [
                fs.writeFile(filenames[0], domain),
                fs.writeFile(filenames[1], problem)
            ];
            return Promise.all(p_writeDomProb).then(() => {
                let pcmd_raw = path.join('planners', pconfig.basedir ? path.join(pconfig.basedir, pconfig.cmd) : pconfig.cmd);
                let pcmd = pcmd_raw.replace(/<DOMAIN>/g, filenames[0])
                    .replace(/<PROBLEM>/g, filenames[1])
                    .replace(/<OUTPUT>/g, filenames[2].toLowerCase() /* fix for planners binaries. */ )
                    .replace(/<PLANFILE>/g, filenames[4].toLowerCase())
                    .replace(/<NUMPLANS>/g, numplans)
                    .replace(/<COSTMULTBOUND>/g,qualitybound);
                logger.info('About to run: ' + pcmd);
                return runAndCatch(pcmd, parseInt(nconf.get("server:timeout")) || 0 )
                    .then(procoutput => readPlannerOutput(procoutput, filenames[2].toLowerCase() /* fix for planner binaries */ , logger))
                    .then(result => {
                        let retObj = _.cloneDeep(result);
                        retObj.planner = pname;
                        retObj.length = _.isArray(retObj.actions) ? retObj.actions.length : NaN;
                        retObj.parse_status = 'ok';
                        if (dontstore || _.isUndefined(storage_opt) || _.isUndefined(storage_opt.type)) {
                            logger.info("Sending response for " + pname + ":\n" + JSON.stringify(retObj, null, 2));
                            logger.info("-----------------------------------------------------------------------------");
                            return Promise.resolve({
                                code: 200,
                                obj: retObj
                            });
                        } else {
                            let enhanced_retObj = _.clone(retObj);
                            enhanced_retObj.planner = {
                                "name": pname,
                                "command": pconfig.cmd
                            };
                            var archive = archiver(filenames[3], { store: true });
                            // add the pddl domain and problem
                            archive.file(filenames[0], { name: 'domain.pddl' });
                            archive.file(filenames[1], { name: 'problem.pddl' });
                            // add standard output and error
                            archive.append(result.raw_output, { name: 'raw_output.log' });
                            // add result json
                            archive.append(JSON.stringify(enhanced_retObj, null, 2), { name: 'result.json' });
                            return archive.finalize().then(() => {
                                var storage = require('./storage/' + storage_opt.type);
                                let destfname = pname.replace(/\W+/g, "_") + '_' + (new Sugar.Date()).format('{yyyy}_{MM}_{dd}_{HH}_{mm}_{ss}_{SSS}') + '.zip';
                                return storage.store(filenames[3], destfname, storage_opt.args).then(() => {
                                    logger.info("Sending response for " + pname + ":\n" + JSON.stringify(retObj, null, 2));
                                    logger.info("-----------------------------------------------------------------------------");
                                    return Promise.resolve({
                                        code: 200,
                                        obj: retObj
                                    });
                                });
                            });
                        }
                    }).catch(err => {
                        logger.error("Error running " + pcmd + ":" + JSON.stringify(err));
                        return Promise.resolve({
                            code: 500,
                            msg: 'Error occurred: ' + JSON.stringify(err)
                        });
                    });
            });
        }).catch(e => {
            logger.error("Error running planner " + pname + ":" + e);
            return Promise.resolve({
                code: 500,
                msg: 'Error: ' + e
            });
        });
}

module.exports.plannerInvocation = function(pname, pconfig, logger) {
    return (req, res) => {
        logger.info('Received request for ' + pname);
        if (!req.body.domain) {
            res.status(400).send("No domain specified");
            return;
        }
        if (!req.body.problem) {
            res.status(400).send("No problem specified");
            return;
        }
        let numplans = parseInt(req.body.numplans) || 5;
        let qualitybound = parseFloat(req.body.qualitybound) || 1.0
        runPlanner(pname, pconfig, req.body.domain, req.body.problem, req.query.dontstore, numplans, qualitybound, logger).then(ret => {
            if (ret.obj) {
                res.status(ret.code).json(ret.obj);
            } else if (ret.msg) {
                res.status(ret.code).send(ret.msg);
            } else {
                res.status(500).send('Error');
            }
        });
    };
};

module.exports.plannerSelectorPromise = function(categ, categObj, logger, plannersConfig, task) {
    if (!('selector' in categObj)) {
        let plannerKey = ''
        if ('default' in categObj) {
            plannerKey = categObj.default;
        } else {
            // just take the first one if any
            let allplanners = _.keys(categObj.planners)
            if (allplanners.length == 0) {
                logger.error("No planners configured for category " + categ);
            } else {
                plannerKey = allplanners[0];
            }
        }
        return runPlanner(plannerKey, categObj.planners[plannerKey], task.domain, task.problem, task.dontstore, task.numplans, task.qualitybound, logger);
    }

    var p_tmpFiles = [
        tmp.tmpName({ template: '/tmp/domain-XXXXXX' }),
        tmp.tmpName({ template: '/tmp/problem-XXXXXX' })
    ];

    return Promise.all(p_tmpFiles).then(filenames => {
        var p_writeDomProb = [
            fs.writeFile(filenames[0], task.domain),
            fs.writeFile(filenames[1], task.problem)
        ];
        return Promise.all(p_writeDomProb).then(() => {
            let pcmd_raw = path.join('planners', selectorConfig.cmd);
            let pcmd = pcmd_raw.replace(/<DOMAIN>/g, filenames[0]) .replace(/<PROBLEM>/g, filenames[1]);
            return childproc(pcmd).then(procoutput => {
                let selectedContent = procoutput.stdout;
                let lines = selectedContent.trim().split('\n');
                let plannerPromises = [];
                for (let l of lines) {
                    // find the planner
                    let pname = l.trim();
                    if (pname in plannersConfig) {
                        plannerPromises.add(
                            runPlanner(pname,
                                categObj.planners[pname],
                                task.domain,
                                task.problem,
                                task.dontstore,
                                task.numplans,
                                task.qualitybound,
                                logger
                            )
                        );
                    }
                }
                return Promise.race(plannerPromises);
            });
        });
    });
};

module.exports.plannerSelector = function(categ, categObj, logger, plannersConfig) {
    const promiseFunc = this.plannerSelectorPromise;
    return function(req, res) {
        if (!req.body.domain) {
            res.status(400).send("No domain specified");
            return;
        }
        if (!req.body.problem) {
            res.status(400).send("No problem specified");
            return;
        }
        let numplans = parseInt(req.body.numplans) || 5;
        let qualitybound = parseFloat(req.body.qualitybound) || 1.0

        let task = {
            domain: req.body.domain,
            problem: req.body.problem,
            dontstore: req.query.dontstore || false,
            numplans: numplans,
            qualitybound : qualitybound
        };
        promiseFunc(categ, categObj, logger, plannersConfig, task).then(ret => {
            if (ret.obj) {
                logger.info("Returning from planner " + JSON.stringify(ret.obj, null, 2));
                res.status(ret.code).json(ret.obj);
            } else if (ret.msg) {
                logger.error("Planner failed with code " + ret.code + " and message " + ret.msg);
                res.status(ret.code).send(ret.msg);
            } else {
                logger.error("Planner failed with unknown error");
                res.status(500).send('Error');
            }
        }).catch(e => {
            logger.error("Error " + e);
            res.status(500).send(e);
        });
    };
};

module.exports.setUpExpress = function(logger) {
    var app = express();
    app.use(bodyparser.json({ limit: '50mb' }));
    app.get("/", (req, res) => { res.redirect("/api-docs/"); });
    app.use(
        log4js.connectLogger(logger, {
            level: "info",
            format: (req, res, format) =>
                format(`:remote-addr :method :url ${JSON.stringify(req.body, null, 2)}`)
        })
    );
    app.use(timeout(1800000));
    return app;
};

module.exports.getEnabledCategories = function(logger) {
    var plannersConfig = nconf.get("planners");
    var runtimeCategories = nconf.get("server:run-categories") || '*';
    var filter;

    if ((runtimeCategories.trim() === '*') || _.isEmpty(runtimeCategories.trim())) {} else {
        filter = runtimeCategories.split(/,\s*/);
    }

    var retCateg = {};
    for(categ in plannersConfig) {
        if (filter && !_.includes(filter, categ)) { continue; }
        retCateg[categ] = _.cloneDeep(plannersConfig[categ]);
        retCateg[categ].planners = _.pickBy(plannersConfig[categ].planners, (val, key) => val.cmd);
        logger.info("In category " + categ + ", selected planners " + _.keys(retCateg[categ].planners));
    }
    logger.info("Finished picking selected categories, result is: " + JSON.stringify(retCateg, null, 2));
    return retCateg;
};

module.exports.startServer = function(apibase, app, logger) {
    var cfEnv = require('cfenv');
    var PORT = process.env.PORT || nconf.get("server:port") || 4501;
    apibase.host = cfEnv.getAppEnv().isLocal
                            ? (nconf.get("server:hostname") || ((require("os").hostname() + ":" + PORT)))
                            : cfEnv.getAppEnv().url;
    app.use('/api-docs', swaggerUI.serve, swaggerUI.setup(apibase));
    var myserver = app.listen(PORT, () => logger.info('Listening on port ' + PORT));
    myserver.timeout=1800000;
};

module.exports.setUpWorkerPlanners = function(plannersConfig, apibase, app, logger) {
    for (categ in plannersConfig) {
        logger.info("Setting up category " + categ);
        for (pc in plannersConfig[categ].planners) {
            logger.info("Setting up planner " + pc);
            let thisPlannerFunc = this.plannerInvocation(pc, plannersConfig[categ].planners[pc], logger);
            apibase.paths["/planners/" + categ + "/" + pc] = this.getOpenAPIDescription(pc);
            app.post('/planners/' + categ + "/" + pc, thisPlannerFunc);
        }
        apibase.paths['/planners/' + categ] = this.getOpenAPIDescription(categ);
        app.post('/planners/' + categ, this.plannerSelector(categ, plannersConfig[categ], logger))
    }
    app.get('/alive', (req, res) => { res.status(200).send('I\'m alive!'); });
};

module.exports.taskDescription = {
    "post": {
        "description": "Executes all available categories of planners on a planning task and returns resulting plan",
        "operationId": "allplanners",
        "consumes": ["application/json"],
        "parameters": [{
            "name": "task",
            "in": "body",
            "description": "the planning task",
            "schema": {
                "$ref": "#/definitions/PlanningTask"
            }
        }],
        "responses": {
            "200": {
                "description": "resulting plans",
                "schema": {
                    "$ref": "#/definitions/AllPlannersResult"
                }
            },
            "default": {
                "description": "unexpected error",
                "schema": {
                    "type": "string"
                }
            }
        }
    }
};

module.exports.addMainTask = function(plannersConfig, apibase, app, logger, plannerPostsFunction) {
    apibase.paths['/planners/task'] = this.taskDescription;
    app.post('/planners/task', (req, res) => {
        if (!req.body.domain) {
            res.status(400).send("No domain specified");
            return;
        }
        if (!req.body.problem) {
            res.status(400).send("No problem specified");
            return;
        }
        let numplans = parseInt(req.body.numplans) || 5;
        let qualitybound = parseFloat(req.body.qualitybound) || 1.0

        let task = {
            domain: req.body.domain,
            problem: req.body.problem,
            dontstore: req.query.dontstore || false,
            numplans: numplans,
            qualitybound: qualitybound
        };
        var plannerPosts = plannerPostsFunction(plannersConfig, task);
        logger.info("There are " + plannerPosts.length + " planner promises.");
        Promise.all(plannerPosts).then(results => {
            logger.info('RESULTS:::' + JSON.stringify(results));
            res.json(_.zipObject(_.keys(plannersConfig), results));
        }).catch(err => {
            logger.info("Error occurred while retrieving planner results:" + JSON.stringify(err, null, 2));
            res.status(500).send({ "error": JSON.stringify(err, null, 2) });
        });
    });
};

