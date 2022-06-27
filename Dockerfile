FROM node:14.17.6

RUN set -ex \
	&& apt-get update \
	&& apt-get install -y build-essential \
	&& apt-get install -y git \
	&& yarn global add @nrwl/cli \
	&& npm install -g nx


RUN yes | adduser --disabled-password remix
USER remix
RUN cd ~ && git clone https://github.com/qtumproject/remix-project.git \
	&& cd remix-project \
	&& yarn install \
	&& yarn run build:libs
RUN cd ~remix/remix-project \
	npx add-nx-to-monorepo \
	&& nx build
EXPOSE 8080
WORKDIR /home/remix/remix-project
ENTRYPOINT nx serve --port=8080 --host=0.0.0.0