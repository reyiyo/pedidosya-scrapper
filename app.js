const fs = require('fs');
const puppeteer = require('puppeteer');
const Promise = require('bluebird');

process.setMaxListeners(0);
const baseUrl = 'https://www.pedidosya.com.ar/restaurantes/buenos-aires?a=';

const getTotalPages = async () => {
    const browser = await puppeteer.launch({ headless: true });

    const page = await browser.newPage();

    await Promise.all([
        page.goto('https://www.pedidosya.com.ar/restaurantes/buenos-aires?a=', { timeout: 0 }),
        page.waitFor('body')
    ]);

    const totalPages = await page.evaluate(() => {
        return document.querySelector('ul.pagination > li:nth-child(5) > a').innerText;
    });

    await browser.close();

    return Number(totalPages);
};

const getRestaurants = async (address = '', actualPage) => {
    const browser = await puppeteer.launch({ headless: true });

    const page = await browser.newPage();

    await Promise.all([page.goto(`${baseUrl}''&page=${actualPage}`, { timeout: 0 }), page.waitFor('body')]);

    const restaurants = await page.evaluate(() => {
        const results = [...document.querySelectorAll('li.restaurant-wrapper')].map(el => {
            const restaurant = JSON.parse(el.getAttribute('data-info'));
            restaurant['url'] = el.getAttribute('data-url');
            restaurant['lat'] = el.getAttribute('data-lat');
            restaurant['lng'] = el.getAttribute('data-lng');
            const img = el.querySelector('a.arrivalLogo > img');
            restaurant['imageLink'] = img ? img.getAttribute('data-original') : null;

            ['status', 'distance', 'favoriteByUser'].forEach(key => delete restaurant[key]);
            restaurant.topCategories = restaurant.topCategories
                ? restaurant.topCategories.map(category => {
                      return {
                          id: category.id,
                          name: category.name,
                          quantity: category.quantity
                      };
                  })
                : [];

            restaurant.paymentMethodsList = restaurant.paymentMethodsList
                ? restaurant.paymentMethodsList.map(pm => {
                      if (typeof pm.options !== 'undefined' && pm.options !== null) {
                          pm.options = pm.options.map(opt => opt.name);
                      }
                      if (typeof pm.onlineOptions !== 'undefined' && pm.onlineOptions !== null) {
                          pm.onlineOptions = pm.onlineOptions.map(opt => opt.name);
                      }

                      return pm;
                  })
                : [];

            return restaurant;
        });

        return results;
    });

    await browser.close();

    console.log(`Done processing page ${actualPage}`);

    return restaurants;
};

const getMenu = async restaurant => {
    const browser = await puppeteer.launch({ headless: true });

    const page = await browser.newPage();

    await Promise.all([page.goto(restaurant.url, { timeout: 0 }), page.waitFor('body')]);

    const menuItems = await page.evaluate(() => {
        const results = [...document.querySelectorAll('li.product')].map(el => {
            const img = el.querySelector('div.profile-image-wrapper > img');
            const name = el.querySelector('.productName');
            const price = el.querySelector('.price');

            return {
                id: el.getAttribute('data-id'),
                name: name ? name.innerText.trim() : null,
                imageUrl: img ? img.getAttribute('src') : null,
                price: price ? price.innerText : null
            };
        });

        return results;
    });

    await browser.close();
    console.log(`Done getting menu for restaurant ${restaurant.name}`);
    return menuItems;
};

const main = async () => {
    console.log(`Getting total pages...`);
    const totalPages = await getTotalPages();
    console.log(`Total pages: ${totalPages}`);
    // const pages = Array.from(Array(totalPages), (_, index) => index + 1);
    const pages = [1, 2, 3, 4, 5, 6];
    const restaurants = [];

    console.log(`Getting restaurants...`);
    await Promise.map(
        pages,
        async page => {
            try {
                const results = await getRestaurants('', page);
                console.log(results[0].url);
                restaurants.push(...results);
            } catch (err) {
                console.error(err);
            }
        },
        { concurrency: 3 }
    );

    console.log(`Total restaurants: ${restaurants.length}`);

    console.log(`Getting menus for restaurants...`);
    await Promise.map(
        restaurants,
        async restaurant => {
            try {
                restaurant['menu'] = await getMenu(restaurant);
            } catch (err) {
                console.error(err);
            }
        },
        { concurrency: 10 }
    );

    fs.writeFile('resturants.json', JSON.stringify(restaurants), err => {
        if (err) {
            console.error(err);
            return process.exit(1);
        }
        console.log('All set!');
        process.exit(0);
    });
};

main();
