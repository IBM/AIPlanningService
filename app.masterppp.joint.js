const mppCommon = require('./app.masterppp.common');
const _ = require('lodash');

var apibase = mppCommon.coreApiBase();
const logger = mppCommon.getLogger("worker");
var app = mppCommon.setUpExpress(logger);
var plannersConfig = mppCommon.getEnabledCategories(logger);

mppCommon.setUpWorkerPlanners(plannersConfig, apibase, app, logger);

function getPlannerPosts(plannersConfig, task) {
    return _.map(_.keys(plannersConfig), function(pc) {
        return mppCommon.plannerSelectorPromise(pc, plannersConfig[pc], logger, plannersConfig, task);
    });
}

mppCommon.addMainTask(plannersConfig, apibase, app, logger, getPlannerPosts);

mppCommon.startServer(apibase, app, logger);