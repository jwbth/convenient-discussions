export default {
	timers: {},
	timerStarts: {},
	timerRunTimes: {},
	timerTotal: {},
	abstractCounters: {},
	abstractGlobalVars: {},
	initTimers: function () {
		this.timers = {};
		this.timerStarts = {};
		this.timerRunTimes = {};
		this.timerTotal = {};
		
		this.abstractCounters = [];
		for (var i = 0; i < 20; i++) {
			this.abstractCounters.push(null);
		}
		this.abstractGlobalVars = [];
	},
	startTimer: function (label) {
		this.timerStarts[label] = $.now();
	},
	endTimer: function (label) {
		if (this.timerStarts[label] == null) return;
		
		if (this.timers[label] == null) {
			this.timers[label] = 0;
		}
		var thisTime = $.now() - this.timerStarts[label];
		this.timers[label] += thisTime;
		this.timerStarts[label] = null;
		
		if (this.timerTotal[label] == null) {
			this.timerTotal[label] = 0;
			this.timerRunTimes[label] = 0;
		}
		this.timerTotal[label] += thisTime;
		this.timerRunTimes[label] += 1;
	},
	resetTimer: function (label) {
		if (this.timerStarts[label] != null) {
			this.endTimer(label);
		}
		
		this.timers[label] = null;
	},
	fullResetTimer: function (label) {
		this.resetTimer(label);
		this.timerTotal[label] = 0;
		this.timerRunTimes[label] = 0;
	},
	logAndResetTimer: function (label) {
		if (this.timerStarts[label] != null) {
			this.endTimer(label);
		}
		if (this.timers[label] != null) {
			console.log(label + ': ' + this.timers[label]);
			
			this.resetTimer(label);
		}
	},
	logAndResetTimers: function (sort) {
		function quasiSortObject(obj) {
			return Object.keys(obj).sort().reduce(function (result, key) {
				result[key] = obj[key];
				return result;
			}, {});
		}
		if (sort) {
			this.timers = quasiSortObject(this.timers);
		}
		for (var label in this.timers) {
			this.logAndResetTimer(label);
		}
	},
	averageTimerTime: function (label) {
		if (!this.timerTotal[label]) {
			console.error('No data for this.timer ' + label);
			return;
		}
		console.log(label + ': ' + (this.timerTotal[label] / this.timerRunTimes[label]).toFixed(1) + ' average for ' +
			this.timerRunTimes[label] + ' runs.');
	},
};