"use strict";

/* global ymaps */
function GeoMotionObject(properties, options) {
    /**
     * Класс расширяший geoObject - добавляет возможность передвигать точку от точка А к точке Б
     *
     * @param {Object}  options
     * @param {Object}  properties
     * @returns {GeoMotionConstructor}
     * @constructor
     */
    function GeoMotionConstructor(properties, options) {
        options = options || {};

        this.waypoints = [];
        // Частота обновления кадров
        this._animate_timeout = 50;

        // Коофициент ускорения машинки
        this._speedFactor = options.speedFactor || 1;
        this._needAnimationTimeout = options.needAnimationTimeout;

        this._directionsVariants = new DirectionVariants(options.countSides || 4);

        /**
         * Пресеты для направлений.
         *
         * @param {Number} n
         * @constructor
         */
        function DirectionVariants(n) {
            this.n = n;

            this.classes = {
                16: ['e', 'see', 'se', 'sse', 's', 'ssw', 'sw', 'sww', 'w', 'nww', 'nw', 'nnw', 'n', 'nne', 'ne', 'nee'],
                8: ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'],
                4: ['e', 's', 'w', 'n']
            };
        }

        /**
         * Вычисляем угол задаваемы координатими x,y - нормализуем
         *
         * @param {Number} x
         * @param {Number} y
         *
         * @returns {String}
         */
        DirectionVariants.prototype.getDirection = function (x, y) {
            var n = this.n,
                n2 = this.n >> 1; // half of n

            var number = (Math.round((Math.atan2(y, x) / Math.PI) * n2 + 1 / n) + n2) % n;
            return this.classes[n][number];
        };

        // Вызываем конструктор родителя
        GeoMotionConstructor.superclass.constructor.call(this, properties, options);
    }

    /**
     * @param {Array} segments - сегменты маршрута
     */
    function getPointsFromSegments (segments) {
        var points = [];
        var coords;
        var cur;
        var prev;

        if (!segments) {
            throw new Error('segments is undefined');
        }

        /* jshint maxdepth:4 */
        // выполняю операцию для всех сегментов
        for (var i = 0, l = segments.length; i < l; i++) {
            // беру координаты начала и конца сегмента
            coords = segments[i].getCoordinates();
            // и добавляю каждую из них в массив, чтобы получить полный список точек
            for (var j = 0, k = coords.length; j < k; j++) {
                cur = coords[j];
                // пропускаем дубли
                if (prev &&
                    prev[0].toPrecision(10) === cur[0].toPrecision(10) &&
                    prev[1].toPrecision(10) === cur[1].toPrecision(10)) {
                    continue;
                }

                points.push(cur);
                prev = cur;
            }
        }

        return points;
    }

    ymaps.util.augment(GeoMotionConstructor, ymaps.GeoObject, {
        /**
         * @param {ymaps.Path} path
         * @param {Object} [options]
         * @param {Number} [options.time] - время прохождения маршрута
         * @param {Number} [options.distance] - дистанция
         * @return {Promise}
         */
        moveOnPath: function (path, options) {
            var dfd = ymaps.vow.defer();

            options = options || {};

            if (!this._dfd || this._isResolved()) {
                this._dfd = dfd;
            }

            var segments = path.getSegments();

            if (!segments) {
                return dfd.reject(new Error('No Segments'));
            }

            var points = getPointsFromSegments(segments);

            var pathLength = options.distance || path.getLength(),
                pathTime = options.time || path.getTime(),
                speed = pathLength / pathTime;

            // Мы не можем запустить анимацию, если машинки нет на карте
            var map = this.getMap();
            if (!map) {
                return dfd.reject(new Error('The car is not added to the map'));
            }

            var projection = map.options.get('projection');

            var stepSpacing = speed / (1000 / this._animate_timeout) * this._speedFactor;

            // Получаем точечки
            this.waypoints = this._makeWayPoints(points, stepSpacing, projection);

            this._startAnimationTime = options.startAnimationTime || new Date().getTime();
            this._animationTime = pathTime * 1000;

            this._runAnimation().then(function () {
                dfd.resolve();
            }, function (er) {
                dfd.reject(er);
            });

            return dfd.promise();
        },

        moveOnPoint: function (points, options) {
            var dfd = ymaps.vow.defer();

            options = options || {};

            if (!this._dfd || this._isResolved()) {
                this._dfd = dfd;
            }

            var pathLength = options.distance,
                pathTime = options.time,
                speed = pathLength / pathTime;

            // Мы не можем запустить анимацию, если машинки нет на карте
            var map = this.getMap();
            if (!map) {
                return dfd.reject(new Error('The car is not added to the map'));
            }

            var projection = map.options.get('projection');

            var stepSpacing = speed / (1000 / this._animate_timeout) * this._speedFactor;

            // Получаем точечки
            this.waypoints = this._makeWayPoints(points, stepSpacing, projection);

            this._startAnimationTime = options.startAnimationTime || new Date().getTime();
            this._animationTime = pathTime * 1000;

            this._runAnimation().then(function () {
                dfd.resolve();
            }, function (er) {
                dfd.reject(er);
            });

            return dfd.promise();
        },

        /**
         * @param {route} paths
         * @param {Number} index
         * @param {Object} [options]
         * @private
         */
        _moveOnRouteStep: function (paths, index, options) {
            var dfd = ymaps.vow.defer(),
                self = this;

            if (index === paths.getLength()) {
                return dfd.resolve();
            }

            var way = paths.get(index);

            return this.moveOnPath(way, options).then(function () {
                return self._moveOnRouteStep(paths, ++index, options);
            });
        },

        /**
         * @param {Array} points
         * @param {Number} index
         * @param {Object} options
         * @private
         */
        _moveOnPointStep: function (points, index, options) {
            var dfd = ymaps.vow.defer(),
                self = this;

            if (index >= points.length) {
                return dfd.resolve();
            }

            var startPoint = points[index],
                endPoint = points[index + 1];

            return this.moveOnPoint([startPoint, endPoint], options).then(function () {
                return self._moveOnPointStep(points, index += 2, options);
            });
        },

        /**
         * Анимация по маршруту
         * @param {route} paths - Путь из роута route.getPaths();
         * @param {Object} [options]
         * @param {Number} [options.time] - Время прохождения пути (секунды)
         * @param {Number} [options.distance] - Дистанция (метры)
         */
        moveOnRoute: function (paths, options) {
            var self = this;

            if (this._dfd && !this._isResolved()) {
                this._dfd.reject();
            }

            this._dfd = ymaps.vow.defer();

            this._moveOnRouteStep(paths, 0, ymaps.util.extend({}, options, {
                startAnimationTime: new Date().getTime()
            })).then(function () {
                self._dfd.resolve();
            }, function (er) {
                self._dfd.reject(er);
            });

            return this._dfd.promise();
        },

        /**
         * Анимация по массиву точек
         * @param {Array} points
         * @param {Object} options
         * @param {Number} options.time - seconds
         * @param {Number} options.distance - meter
         * @returns {*}
         */
        moveOnPoints: function (points, options) {
            var self = this;

            if (this._dfd && !this._isResolved()) {
                this._dfd.reject();
            }

            this._dfd = ymaps.vow.defer();

            this._moveOnPointStep(points, 0, ymaps.util.extend({}, options, {
                startAnimationTime: new Date().getTime()
            })).then(function () {
                self._dfd.resolve();
            }, function (er) {
                self._dfd.reject(er);
            });

            return this._dfd.promise();
        },

        /**
         * Приостановить поездку.
         */
        pause: function () {
            if (!this._dfd || this._isResolved()) {
                return;
            }

            if (this.getState() !== 'moving') {
                return;
            }

            clearTimeout(this._animateTimer);
            // ставим машинке правильное направление - в данном случае меняем ей текст
            this.properties.set('state', 'stopped');
        },

        /**
         * Возобновить поездку.
         */
        resume: function () {
            if (!this._dfd || this._isResolved()) {
                return;
            }

            if (this.getState() === 'stopped') {
                this._runAnimation();
            }
        },

        /**
         * Запросить состояние объекта
         * @returns {String}
         */
        getState: function () {
            return this.properties.get('state');
        },

        /**
         * Останавливаем и чистим
         */
        abort: function () {
            if (!this._dfd || this._isResolved()) {
                return;
            }

            this.properties.set('state', '');
            clearTimeout(this._animateTimer);
            this.waypoints = [];

            this._dfd.resolve('aborted');
        },

        /**
         * Запускаем анимацию. Меняем по тику геометрию и properties Геообъекта
         *
         * @return {Promise}
         * @private
         */
        _runAnimation: function () {
            var self = this;
            var dfd = ymaps.vow.defer();

            // Чистим прошлый таймаут
            if (this._animateTimer) {
                clearTimeout(this._animateTimer);
            }

            this.properties.set('state', 'moving');

            this._animateTimer = setInterval(function () {
                var now = new Date().getTime();

                // если точек больше нет - значит приехали
                if (self.waypoints.length === 0) {
                    clearTimeout(self._animateTimer);
                    self.properties.set('state', '');

                    return dfd.resolve('completed');
                }

                // берем следующую точку
                var nextPoint = self.waypoints.shift();

                if (self._needAnimationTimeout && (now - self._startAnimationTime > self._animationTime)) {
                    nextPoint = self.waypoints.pop() || nextPoint;
                    // перемещаем машинку
                    self.geometry.setCoordinates(nextPoint.coords);
                    // ставим машинке правильное направление и угол поворота
                    self.properties.set({direction: nextPoint.direction, deg: nextPoint.deg});

                    clearTimeout(self._animateTimer);
                    self.properties.set('state', '');

                    return dfd.resolve('completed');
                }

                // перемещаем машинку
                self.geometry.setCoordinates(nextPoint.coords);
                // ставим машинке правильное направление и угол поворота
                self.properties.set({direction: nextPoint.direction, deg: nextPoint.deg});
            }, this._animate_timeout);

            return dfd.promise();
        },

        _isResolved: function () {
            if (this._dfd) {
                return this._dfd._p.isResolved();
            }

            return true;
        },

        /**
         * Раскладываем наши сегменты на шаги, так, что бы за указанное время была пройдена вся дистанция
         *
         * @param {Array}   points     - массив точек составляющих путь (путь состоит из сегментов)
         * @param {Number}  stepSpacing  - Скорость прохождения дистанции = расстояние / время пути
         * @param {Object}  projection
         * @returns {Array}
         */
        _makeWayPoints: function (points, stepSpacing, projection) {
            var coordSystem = projection.getCoordSystem();

            var wayList = [],
            // вспомогательные
                i, j, l,
                directionsVariants = this._directionsVariants;

            // Проходим точки с заданной скоростью
            for (i = 0, l = points.length - 1; l; --l, ++i) {
                var from = points[i],
                    to = points[i + 1],
                    diffX = to[0] - from[0],
                    diffY = to[1] - from[1],
                // Пиксельные координаты точки для расчетов смещения
                    fromToPixel = projection.toGlobalPixels(from, 10),
                    toToPixel = projection.toGlobalPixels(to, 10),
                    diffXPixel = fromToPixel[0] - toToPixel[0],
                    diffYPixel = fromToPixel[1] - toToPixel[1];

                var direction = directionsVariants.getDirection(diffXPixel, diffYPixel),
                    dist = Math.round(coordSystem.distance(from, to)),
                // Угол поворота машинки. Переводим координаты смещения в градусы.
                // Необхолимо добавить смещение в 90* Т.к. иконка у нас направлена на север
                    deg = Math.round(Math.atan2(diffYPixel, diffXPixel) * 180 / Math.PI) - 90,
                    prop;

                // каждую шестую, а то слишком медленно двигается. чрезмерно большая точность
                for (j = 0; j < dist; j += stepSpacing) {
                    prop = j / dist;
                    wayList.push({
                        coords: [
                            (from[0] + (diffX * prop)).toFixed(6),
                            (from[1] + (diffY * prop)).toFixed(6)
                        ],
                        direction: direction,
                        deg: deg
                    });
                }
            }

            return wayList;
        }
    });

    return new GeoMotionConstructor(properties, options);
}