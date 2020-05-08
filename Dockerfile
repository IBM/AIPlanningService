FROM ubuntu:18.04

RUN apt-get update && \
    apt-get install -y locales jq vim wget curl gawk \
    cmake g++ g++-multilib make python python-dev python-pip

# Install basic dev tools
RUN pip install --upgrade pip
RUN pip install h5py keras numpy pillow scipy tensorflow-cpu subprocess32

RUN curl -sL https://deb.nodesource.com/setup_12.x | bash && apt-get install -y nodejs build-essential

# Set up environment variables
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8 \ 
	CXX=g++ \
	HOME=/app \
	BASE_DIR=/app/planners

# Create required directories
RUN mkdir -p $HOME && mkdir -p $BASE_DIR
WORKDIR $BASE_DIR


#################################
# Download and Install Delfi IPC2018 version
#################################
ENV DL_URL=https://bitbucket.org/ipc2018-classical/team23/get/ipc-2018-seq-opt.tar.gz
RUN curl -SL $DL_URL | tar -xz \
	&& mv ipc2018-classical-team23* delfi \
	&& cd delfi \
    && sed -i 's/-Werror//g' src/cmake_modules/FastDownwardMacros.cmake  \
	&& python ./build.py release64 \
    && cd symba \
    && sed -i 's/-Werror//g' src/search/Makefile \
    && ./build 

RUN echo 'alias delfi="python ${BASE_DIR}/delfi/plan-ipc.py --image-from-lifted-task"' >> ~/.bashrc


#################################
# Download and Install Cerberus, post-IPC2018 version
#################################
ENV RB_URL=https://github.com/ctpelok77/fd-red-black-postipc2018/archive/master.tar.gz
RUN curl -SL $RB_URL | tar -xz \
	&& mv fd-red-black-postipc2018* cerberus \
	&& cd cerberus \
	&& python ./build.py -j 2
RUN echo 'alias cerberus-sat="python ${BASE_DIR}/cerberus/plan-sat.py"' >> ~/.bashrc
RUN echo 'alias cerberus-agl="python ${BASE_DIR}/cerberus/plan-agl.py"' >> ~/.bashrc


#################################
# Download and Install ForbidIterative
#################################
ENV FI_URL=https://zenodo.org/record/3246774/files/ForbidIterative.tar.gz
RUN curl -SL $FI_URL | tar -xz \
        && mv ForbidIterative forbiditerative \
	&& cd forbiditerative \
    && sed -i 's/-Werror//g' src/cmake_modules/FastDownwardMacros.cmake  \
	&& python ./build.py release64 

ENV DS_URL=https://zenodo.org/record/3404122/files/DiverseScore.tar.gz
RUN mkdir diversescore && cd diversescore \
    && curl -SL $DS_URL | tar -xz \
	&& python ./build.py 

ENV DIVERSE_FAST_DOWNWARD_PLANNER_PATH=${BASE_DIR}/cerberus
ENV DIVERSE_SCORE_COMPUTATION_PATH=${BASE_DIR}/diversescore

RUN echo 'alias fi-topk="python ${BASE_DIR}/forbiditerative/plan_topk.sh"' >> ~/.bashrc
RUN echo 'alias fi-topq="python ${BASE_DIR}/forbiditerative/plan_unordered_topq.sh"' >> ~/.bashrc
RUN echo 'alias fi-diverse="python ${BASE_DIR}/forbiditerative/plan_diverse_sat.sh"' >> ~/.bashrc


#################################
# Download and Install K*
#################################
ENV KSTAR_URL=https://github.com/ctpelok77/kstar/archive/master.tar.gz
RUN curl -SL $KSTAR_URL | tar -xz \
        && mv kstar-* kstar \
	&& cd kstar \
	&& python ./build.py release64 
RUN echo 'alias kstar="python ${BASE_DIR}/kstar/fast-downward.py --build release64"' >> ~/.bashrc

#################################
# Setup NodeJS application dependencies
#################################
COPY package.json  $HOME/

WORKDIR $HOME
RUN npm install
ENV BLUEBIRD_DEBUG=1
ENV DEBUG=*
EXPOSE 4501


ENV DIVERSE_FAST_DOWNWARD_PLANNER_PATH=${BASE_DIR}/cerberus
ENV DIVERSE_SCORE_COMPUTATION_PATH=${BASE_DIR}/diversescore
COPY utils/plans_to_json.py $BASE_DIR/

## Creating a run script for Delfi
RUN echo '#!/bin/bash' > $BASE_DIR/delfi/plan-delfi.sh
RUN echo 'LOG_FILE=run.log' >> $BASE_DIR/delfi/plan-delfi.sh
RUN echo 'SOURCE="$( dirname "${BASH_SOURCE[0]}" )"' >> $BASE_DIR/delfi/plan-delfi.sh
RUN echo '$SOURCE/plan-ipc.py --image-from-lifted-task $1 $2 $3 > $LOG_FILE' >> $BASE_DIR/delfi/plan-delfi.sh
RUN echo '$SOURCE/../plans_to_json.py --domain $1 --problem $2 --plans-folder . --plan-file $3 --json-file $4' >> $BASE_DIR/delfi/plan-delfi.sh
RUN chmod 755 $BASE_DIR/delfi/plan-delfi.sh

## Creating a run script for Cerberus
RUN echo '#!/bin/bash' > $BASE_DIR/cerberus/plan-sat.sh
RUN echo 'LOG_FILE=run.log' >> $BASE_DIR/cerberus/plan-sat.sh
RUN echo 'SOURCE="$( dirname "${BASH_SOURCE[0]}" )"' >> $BASE_DIR/cerberus/plan-sat.sh
RUN echo '$SOURCE/plan-sat.py $1 $2 $3 > $LOG_FILE' >> $BASE_DIR/cerberus/plan-sat.sh
RUN echo '$SOURCE/../plans_to_json.py --domain $1 --problem $2 --plans-folder . --plan-file $3 --json-file $4' >> $BASE_DIR/cerberus/plan-sat.sh
RUN chmod 755 $BASE_DIR/cerberus/plan-sat.sh

RUN echo '#!/bin/bash' > $BASE_DIR/cerberus/plan-agl.sh
RUN echo 'LOG_FILE=run.log' >> $BASE_DIR/cerberus/plan-agl.sh
RUN echo 'SOURCE="$( dirname "${BASH_SOURCE[0]}" )"' >> $BASE_DIR/cerberus/plan-agl.sh
RUN echo '$SOURCE/plan-agl.py $1 $2 $3 > $LOG_FILE' >> $BASE_DIR/cerberus/plan-agl.sh
RUN echo '$SOURCE/../plans_to_json.py --domain $1 --problem $2 --plans-folder . --plan-file $3 --json-file $4' >> $BASE_DIR/cerberus/plan-agl.sh
RUN chmod 755 $BASE_DIR/cerberus/plan-agl.sh

#################################
# Copy NodeJS service
#################################
RUN mkdir $HOME/samples
COPY samples/domain1.pddl $HOME/samples/
COPY samples/problem1.pddl $HOME/samples/
COPY config $HOME/config
COPY storage $HOME/storage
COPY apibase.masterppp.json $HOME/
COPY conf.js $HOME/
COPY app.masterppp.common.js $HOME/
COPY app.masterppp.joint.js $HOME/

CMD ["npm", "start"]
