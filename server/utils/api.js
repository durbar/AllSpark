const zlib = require('zlib');
const mysql = require('./mysql').MySQL;
const fs = require('fs');
const pathSeparator = require('path').sep;
const {resolve} = require('path');
const commonFun = require('./commonFunctions');
const User = require('./User');
const constants = require('./constants');
const assert = require("assert");
const pgsql = require("./pgsql").Postgres;
const errorLogs = require('./errorLogs');

class API {

	constructor() {

		this.mysql = mysql;
		this.pgsql = pgsql;
	}

	static setup() {

		API.endpoints = new Map;

		function walk(directory) {

			for (const file of fs.readdirSync(directory)) {

				const path = resolve(directory, file).replace(/\//g, pathSeparator);

				if (fs.statSync(path).isDirectory()) {
					walk(path);
					continue;
				}

				if (!path.endsWith('.js'))
					continue;

				const module = require(path);

				for (const key in module) {

					// Make sure the endpoint extends API class
					if (module.hasOwnProperty(key) && module[key] && module[key].prototype && module[key].prototype.__proto__.constructor == API)
						API.endpoints.set([path.slice(0, -3), key].join(pathSeparator), module[key]);
				}
			}
		}

		walk(__dirname + '/../www');
	}

	static serve(clientEndpoint) {

		return async function (request, response, next) {

			let obj;

			try {

				const
					url = request.url.replace(/\//g, pathSeparator),
					path = resolve(__dirname + '/../www') + pathSeparator + url.substring(4, url.indexOf('?') < 0 ? undefined : url.indexOf('?'));

				if (!API.endpoints.has(path) && !clientEndpoint) {
					return next();
				}

				let endpoint = clientEndpoint || API.endpoints.get(path);

				obj = new endpoint();

				obj.request = request;
				obj.response = response;
				obj.assert = assertExpression;

				const token = request.query.token || request.body.token;

				let userDetails;

				if (token) {

					userDetails = await commonFun.verifyJWT(token);

					obj.user = new User(userDetails);
				}

				let host = request.headers.host.split(':')[0];

				if (!(host in global.account)) {
					throw new API.Exception(400, 'Account not found!');
				}

				for (const host in global.account) {

					if (userDetails && global.account[host].account_id == userDetails.account_id) {
						obj.account = global.account[host];
					}
				}

				if (!obj.account) {
					obj.account = global.account[host];
				}

				if (clientEndpoint) {
					obj.result = await obj.body();
				}

				else {

					if ((!userDetails || userDetails.error) && !constants.publicEndpoints.filter(u => url.startsWith(u.replace(/\//g, pathSeparator))).length) {
						throw new API.Exception(401, 'User Not Authenticated! :(');
					}

					obj.result = await obj[path.split(pathSeparator).pop()]();

					obj.result = {
						status: obj.result ? true : false,
						data: obj.result,
					};

					response.set({'Content-Encoding': 'gzip'});
					response.set({'Content-Type': 'application/json'});

					await obj.gzip();
				}

				response.send(obj.result);
			}

			catch (e) {

				if(e.pass) {
					return;
				}

				if (obj) {

					await API.errorMessage(e, obj);
				}

				if (e instanceof API.Exception) {

					return response.status(e.status || 500).send({
						status: false,
						message: e.message,
					});
				}

				if (!(e instanceof Error)) {

					e = new Error(e);
					e.status = 400;
				}

				if (e instanceof assert.AssertionError) {

					if (commonFun.isJson(e.message)) {
						e.message = JSON.parse(e.message);
					}
					e.status = e.message.status || 400;
					e.message = e.message.message || (typeof e.message === typeof "string" ? e.message : "Something went wrong! :(");
				}

				else {
					e.status = e.status || 500;
				}

				return next(e);
			}
		}
	}

	static async errorMessage(e, obj) {

		try {
			const error = {
				account_id: obj.account.account_id,
				user_id: obj.user.user_id,
				message: e.message || e.sqlMessage,
				url: obj.request.url,
				description: JSON.stringify(e),
				type: "server"
			};

			await errorLogs.insert(error);
		}
		catch (e) {
			return e;
		}

	}

	async gzip() {

		return new Promise((resolve, reject) => {
			zlib.gzip(JSON.stringify(this.result), (error, result) => {

				if (error)
					reject(['API response gzip compression failed!', error]);

				else {
					this.result = result;
					resolve();
				}
			});
		});
	}
}

function assertExpression(expression, message, statusCode) {

	return assert(expression,
		JSON.stringify({
			message: message,
			status: statusCode,
		}));
}

API.Exception = class {

	constructor(status, message) {
		this.status = status;
		this.message = message;

		console.error("API Exception Error!!!!", this);
		console.trace();
	}
}

module.exports = API;
API.setup();