'use strict';

var MultipleTransition = require('./MultipleTransition');
var TweenTransition = require('./TweenTransition');

/**
 * A state maintainer for a smooth transition between
 *    numerically-specified states. Example numeric states include floats or
 *    Transform objects.
 *
 * An initial state is set with the constructor or set(startState). A
 *    corresponding end state and transition are set with set(endState,
 *    transition). Subsequent calls to set(endState, transition) begin at
 *    the last state. Calls to get(timestamp) provide the interpolated state
 *    along the way.
 *
 * Note that there is no event loop here - calls to get() are the only way
 *    to find state projected to the current (or provided) time and are
 *    the only way to trigger callbacks. Usually this kind of object would
 *    be part of the render() path of a visible component.
 *
 * @class Transitionable
 * @constructor
 * @param {number|Array.Number|Object.<number|string, number>} start
 *    beginning state
 */
function Transitionable(start) {
    this._endStateQueue = [];
    this._transitionQueue = [];
    this._callbackQueue = [];

    this.reset(start);
}

var transitionMethods = {};

Transitionable.registerMethod = function registerMethod(name, engineClass) {
    if (!(name in transitionMethods)) {
        transitionMethods[name] = engineClass;
        return true;
    }
    else return false;
};

Transitionable.unregisterMethod = function unregisterMethod(name) {
    if (name in transitionMethods) {
        delete transitionMethods[name];
        return true;
    }
    else return false;
};

function _loadNext() {
    /*jshint validthis: true */
    if (this._callback) {
        var callback = this._callback;
        this._callback = null;
        callback();
    }
    if (this._transitionQueue.length === 0) {
        this.set(this.get()); // no update required
        return;
    }
    this._currentEndState = this._endStateQueue.shift();
    this._currentTransition = this._transitionQueue.shift();
    this._callback = this._callbackQueue.shift();

    var method = null;
    if (this._currentTransition instanceof Object && this._currentTransition.method) {
        method = this._currentTransition.method;
        if (typeof method === 'string') method = transitionMethods[method];
    }
    else {
        method = TweenTransition;
    }

    if (this._currentMethod !== method) {
        if (!(this._currentEndState instanceof Object) || method.SUPPORTS_MULTIPLE === true || this._currentEndState.length <= method.SUPPORTS_MULTIPLE) {
            this._engineInstance = new method();
        }
        else {
            this._engineInstance = new MultipleTransition(method);
        }
        this._currentMethod = method;
    }

    this._engineInstance.reset(this.state, this.velocity);
    if (this.velocity !== undefined) this._currentTransition.velocity = this.velocity;
    this._engineInstance.set(this._currentEndState, this._currentTransition, _loadNext.bind(this));
}

/**
 * Add transition to end state to the queue of pending transitions. Special
 *    Use: calling without a transition resets the object to that state with
 *    no pending actions
 *
 * @method set
 *
 * @param {number|FamousMatrix|Array.Number|Object.<number, number>} endState
 *    end state to which we interpolate
 * @param {transition=} transition object of type {duration: number, curve:
 *    f[0,1] -> [0,1] or name}. If transition is omitted, change will be
 *    instantaneous.
 * @param {function()=} callback Zero-argument function to call on observed
 *    completion (t=1)
 */
Transitionable.prototype.set = function set(endState, transition, callback) {
    if (!transition) {
        this.reset(endState);
        if (callback) callback();
        return this;
    }

    this._endStateQueue.push(endState);
    this._transitionQueue.push(transition);
    this._callbackQueue.push(callback);

    if (!this._currentTransition && !this._currentEndState) _loadNext.call(this);
    return this;
};

/**
 * Cancel all transitions and reset to a stable state
 *
 * @method reset
 * @chainable
 *
 * @param {number|Array.Number|Object.<number, number>} startState
 *    stable state to set to
 */
Transitionable.prototype.reset = function reset(startState, startVelocity) {
    this._currentMethod = null;
    this._engineInstance = null;
    this.state = startState;
    this.velocity = startVelocity;

    this._currentEndState = null;
    this._currentTransition = null;
    this._callback = null;

    this._endStateQueue.length = 0;
    this._transitionQueue.length = 0;
    this._callbackQueue.length = 0;
    return this;
};

/**
 * Add delay action to the pending action queue queue.
 *
 * @method delay
 * @chainable
 *
 * @param {number} duration delay time (ms)
 * @param {function} callback Zero-argument function to call on observed
 *    completion (t=1)
 * @return {Transitionable} this
 */
Transitionable.prototype.delay = function delay(duration, callback) {
    var endValue;
    if (this._endStateQueue.length) {
        endValue = this._endStateQueue[this._endStateQueue.length - 1];
    } else if (this._currentEndState) {
        endValue = this._currentEndState;
    } else {
        endValue = this.get();
    }

    return this.set(endValue, {
        duration: duration,
        curve: function() {
            return 0;
        }
    }, callback);
};

/**
 * Get interpolated state of current action at provided time. If the last
 *    action has completed, invoke its callback.
 *
 * @method get
 *
 * @param {number=} timestamp Evaluate the curve at a normalized version of this
 *    time. If omitted, use current time. (Unix epoch time)
 * @return {number|Object.<number|string, number>} beginning state
 *    interpolated to this point in time.
 */
Transitionable.prototype.get = function get(timestamp) {
    if (this._engineInstance) {
        if (this._engineInstance.getVelocity)
            this.velocity = this._engineInstance.getVelocity();
        this.state = this._engineInstance.get(timestamp);
    }
    return this.state;
};

/**
 * Is there at least one action pending completion?
 *
 * @method isActive
 *
 * @return {boolean}
 */
Transitionable.prototype.isActive = function isActive() {
    return !!this._currentTransition;
};

/**
 * Halt transition at current state and erase all pending actions.
 *
 * @method halt
 * @chainable
 * 
 * @return {Transitionable} this
 */
Transitionable.prototype.halt = function halt() {
    this.set(this.get());
    return this;
};

/**
 * Pause transition. This will not erase any actions.
 * 
 * @method pause
 * @chainable
 * 
 * @return {Transitionable} this
 */
Transitionable.prototype.pause = function pause() {
    if (this._engineInstance) this._engineInstance.pause();
    return this;
};

/**
 * Has the current action been paused?
 *
 * @method isPaused
 * @chainable
 * 
 * @return {Boolean} if the current action has been paused
 */
Transitionable.prototype.isPaused = function isPaused() {
    if (!this._engineInstance) {
        return false;
    }
    else {
        return this._engineInstance.isPaused();
    }
};

/**
 * Resume transition.
 * 
 * @method resume
 * @chainable
 * 
 * @return {Transitionable} this
 */
Transitionable.prototype.resume = function resume() {
    if (this._engineInstance) this._engineInstance.resume();
    return this;
};

module.exports = Transitionable;
