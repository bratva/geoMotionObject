## YMaps GeoMotion

Плагин для плавной анимации [geoObject](https://tech.yandex.ru/maps/doc/jsapi/2.1/ref/reference/GeoObject-docpage/).

Поддерживает следующие методы анимации:
  - `moveOnPath` - по кусочку пути полученному от роутера;
  - `moveOnPoint` - от точки А к точке Б;
  - `moveOnRoute` - по маршруту роутера;
  - `moveOnPoints` - по массиву точке.

Доп. возможности:
  - `pause`/`resume` - Остановка/Запуск анимации
  - `abort` - Прерывание анимации

**Пример**

- Создаем экземпляр

```js
var car = new GeoMotionObject({
        // Описываем геометрию типа "Точка".
        geometry: {
            type: "Point",
            coordinates: [55.7571, 37.61681]
        }
    }, {
        iconLayout: ymaps.templateLayoutFactory.createClass('...'),
        iconImageSize: [54, 54],
        iconOffset: [-27, -27],
        interactivityModel: 'default#opaque',

        // Ускоритель
        speedFactor: 4,
        // Количество поддерживаемых сторон (4/8/16)
        countSides: 16
    });
```

- Анимируем
```js
ymaps.route(
        [
            [55.7571, 37.61681],
            [55.7871, 37.58681],
            [55.7971, 37.64681],
            [55.7271, 37.70681]
        ]
    ).then(
        function (route) {
            route.getPaths().options.set({
                strokeColor: '110000ff',
                opacity: 0.4
            });

			var paths = route.getPaths();
			  
            map.geoObjects.add(route);
            map.geoObjects.add(car);

            car.moveOnRoute(paths).then(function (status) {
                console.log('car', status);
            });
        });
``` 

[Демо](https://rawgithub.com/bratva/geoMotionObject/master/index.html)
