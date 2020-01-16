/*
 * Copyright (c) 2019 Rafael da Silva Rocha.
 * Copyright 2012 Spencer Cohen
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 */

/**
 * @fileoverview The Interpolator class. Based on Smooth.js by Spencer Cohen.
 * @see https://github.com/rochars/wavefile
 * @see https://github.com/osuushi/Smooth.js
 */

/**
 * A class to get scaled values out of arrays.
 * @extends WaveFileReader
 */
export class Interpolator {
  
  /**
   * @param {number} scaleFrom the length of the original array.
   * @param {number} scaleTo The length of the new array.
   * @param {?Object} details The extra configuration, if needed.
   */
  constructor(scaleFrom, scaleTo, details) {
    /**
     * The length of the original array.
     * @type {number}
     */
    this.length_ = scaleFrom;
    /**
     * The scaling factor.
     * @type {number}
     */
    this.scaleFactor_ = (scaleFrom - 1) / scaleTo;
    /**
     * The interpolation function.
     * @type {Function}
     */
    this.interpolate = this.sinc;
    if (details.method === 'point') {
    	this.interpolate = this.point;
    } else if(details.method === 'linear') {
    	this.interpolate = this.linear;
    } else if(details.method === 'cubic') {
    	this.interpolate = this.cubic;
    }
    /**
     * The clipping function.
     * @type {Function}
     */
    this.clip_ = clipClamp_;
    // The clip function
    if (details.clip === 'periodic') {
      this.scaleFactor_ = scaleFrom / scaleTo;
      this.clip_ = clipPeriodic_;
    } else if (details.clip === 'mirror') {
      this.clip_ = clipMirror_;
    }
    /**
     * The tanget factor for cubic interpolation.
     * @type {number}
     */
    this.tangentFactor_ = 1 - Math.max(0, Math.min(1, details.tension || 0));
    // Configure the kernel for sinc
    /**
     * The sinc filter size.
     * @type {number}
     */
    this.sincFilterSize_ = details.sincFilterSize || 1;
    /**
     * The sinc kernel.
     * @type {Function}
     */
    this.kernel_ = sincKernel_(details.sincWindow || gaussianWindow_);
    if (details.method === 'lanczos') {
      this.kernel_ = sincKernel_(lanczosWindow_(details.lanczosFilterSize));
      this.sincFilterSize = details.lanczosFilterSize;
    }
  }

  /**
   * @param {number} t The index to interpolate.
   * @param {Array|TypedArray} samples the original array.
   * @return {number} The interpolated value.
   */
  point(t, samples) {
    return this.getClippedInput_(Math.round(this.scaleFactor_ * t), samples);
  }

  /**
   * @param {number} t The index to interpolate.
   * @param {Array|TypedArray} samples the original array.
   * @return {number} The interpolated value.
   */
  linear(t, samples) {
    t = this.scaleFactor_ * t;
    let k = Math.floor(t);
    t -= k;
    return (1 - t) *
    	this.getClippedInput_(k, samples) + t *
    	this.getClippedInput_(k + 1, samples);
  }

  /**
   * @param {number} t The index to interpolate.
   * @param {Array|TypedArray} samples the original array.
   * @return {number} The interpolated value.
   */
  cubic(t, samples) {
    t = this.scaleFactor_ * t;
    let k = Math.floor(t);
    let m = [this.getTangent_(k, samples), this.getTangent_(k + 1, samples)];
    let p = [this.getClippedInput_(k, samples),
      this.getClippedInput_(k + 1, samples)];
    t -= k;
    let t2 = t * t;
    let t3 = t * t2;
    return (2 * t3 - 3 * t2 + 1) *
      p[0] + (t3 - 2 * t2 + t) *
      m[0] + (-2 * t3 + 3 * t2) *
      p[1] + (t3 - t2) * m[1];
  }

  /**
   * @param {number} t The index to interpolate.
   * @param {Array|TypedArray} samples the original array.
   * @return {number} The interpolated value.
   */
  sinc(t, samples) {
    t = this.scaleFactor_ * t;
    let k = Math.floor(t);
    let ref = k - this.sincFilterSize_ + 1;
    let ref1 = k + this.sincFilterSize_;
    let sum = 0;
    for (let n = ref, j = ref;
        ref <= ref1 ? j <= ref1 : j >= ref1; 
        n = ref <= ref1 ? ++j : --j) {
      sum += this.kernel_(t - n) * this.getClippedInput_(n, samples);
    }
    return sum;
  }

  /**
   * @param {number} k The scaled index to interpolate.
   * @param {Array|TypedArray} samples the original array.
   * @return {number} The tangent.
   * @private
   */
  getTangent_(k, samples) {
    return this.tangentFactor_ *
      (this.getClippedInput_(k + 1, samples) -
        this.getClippedInput_(k - 1, samples)) / 2;
  }

  /**
   * @param {number} t The scaled index to interpolate.
   * @param {Array|TypedArray} samples the original array.
   * @return {number} The interpolated value.
   * @private
   */
  getClippedInput_(t, samples) {
    if ((0 <= t && t < this.length_)) {
      return samples[t];
    }
    return samples[this.clip_(t, this.length_)];
  }
}

// Sinc functions

/**
 * The default window function.
 * @param {number} x The sinc signal.
 * @return {number}
 * @private
 */
function gaussianWindow_(x) {
  return Math.exp(-x * x);
}

/**
 * @param {Function} window The window function.
 * @return {Function}
 * @private
 */
function sincKernel_(window) {
  return function(x) { return sinc_(x) * window(x); };
}

/**
 * @param {number} size The filter size.
 * @return {Function}
 * @private
 */
function lanczosWindow_(size) {
  return function(x) { return sinc_(x / size); };
}

/**
 * @param {number} x The sinc signal.
 * @return {number}
 * @private
 */
function sinc_(x) {
  if (x === 0) {
    return 1;
  }
  return Math.sin(Math.PI * x) / (Math.PI * x);
}

// Clip functions

/**
 * @param {number} t The scaled index
 * @param {number} n The size of the original array
 * @return {number}
 * @private
 */
function clipClamp_(t, n) {
  return Math.max(0, Math.min(t, n - 1));
}

/**
 * @param {number} t The scaled index
 * @param {number} n The size of the original array
 * @return {number}
 * @private
 */
function clipPeriodic_(t, n) {
  t = t % n;
  if (t < 0) {
    t += n;
  }
  return t;
}

/**
 * @param {number} t The scaled index
 * @param {number} n The size of the original array
 * @return {number}
 * @private
 */
function clipMirror_(t, n) {
  let period = 2 * (n - 1);
  t = clipPeriodic_(t, period);
  if (t > n - 1) {
    t = period - t;
  }
  return t;
}