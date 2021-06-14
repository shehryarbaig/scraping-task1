const fetch = require("node-fetch");
const cheerio = require("cheerio");
const fs = require("fs");
const { val } = require("cheerio/lib/api/attributes");
const getRawData = (URL) => {
    return fetch(URL)
        .then((response) => response.text())
        .then((data) => {
            return data;
        });
};

const getProductUrls = async (url, category, subCategory) => {

    try {
        let productURLS = [];
        const categoryRawData = await getRawData(url);
        const parsedCategoryRawData = cheerio.load(categoryRawData);
        parsedCategoryRawData("#catalog-listing > div > div.category-products > product-block").each
            (function (i, e) {
                productURLS.push(parsedCategoryRawData(this).children('a').first().attr('href'));
            });

        const isNextPage = parsedCategoryRawData("#catalog-listing > div > div.pager.row > div.next.col-xs-4").has('a.next').length;
        let productURLSNextPage = [];
        if (isNextPage) {
            console.log("next page \n");
            const nextPage = parsedCategoryRawData("#catalog-listing > div > div.pager.row > div.next.col-xs-4 > a").attr('href');
            console.log(nextPage);
            productURLSNextPage = await getProductUrls(nextPage, category, subCategory);
        }
        return productURLS.concat(productURLSNextPage);
    }
    catch (error) {
        console.log(error);
    }
};

const scrapeCategoriesData = async (url) => {

    try {
        let subCategoryURLS = [];
        let productInfo = {};
        const hypedcRawData = await getRawData(url);
        const parsedHypedRawData = cheerio.load(hypedcRawData);

        for (i = 2; i < 5; i++) {
            const Category = parsedHypedRawData("body > header > div.header-inner > nav > ul > li:nth-child(" + i + ") > a > span:nth-child(1)").text().trim();
            parsedHypedRawData("body > header > div.header-inner > nav > ul > li:nth-child(" + i + ") > div > div > ul.nav-secondary-category-list li.nav-tertiary-category").each
                (function (i, e) {
                    const subCategory = parsedHypedRawData(this).text().replace("\n", "").trim();
                    subCategoryURLS.push({ Category: Category, SubCategory: subCategory, SubCategoryURL: parsedHypedRawData(this).children('a').first().attr('href') });

                });
        }

        return subCategoryURLS;
    }
    catch (error) {
        console.log(error);
    }

};
let progress = 0;
const getProductData = async (url) => {
    try {
        const productRawData = await getRawData(url);
        const parsedProductRawData = cheerio.load(productRawData);

        let productName = parsedProductRawData('#product_addtocart_form > div > div.col-sm-10 > div.page-header.col-xs-18.col-sm-24 > h1').text().trim();

        let productPrice = parsedProductRawData("#product_addtocart_form > div > div.col-sm-10 > div.clearfix.hidden-xs.product-price-container > h2").attr('data-bf-productprice');


        let [inStockSizesUSMen, outStockSizesUSMen] = [getProductSizes("in", "#size-selector-tab-desktop-0", parsedProductRawData),
        getProductSizes("out", "#size-selector-tab-desktop-0", parsedProductRawData)];
        let [inStockSizesUSWomen, outStockSizesWomen] = [getProductSizes("in", "#size-selector-tab-desktop-1", parsedProductRawData),
        getProductSizes("out", "#size-selector-tab-desktop-1", parsedProductRawData)];
        let [inStockSizesUK, outStockSizesUK] = [getProductSizes("in", "#size-selector-tab-desktop-2", parsedProductRawData),
        getProductSizes("out", "#size-selector-tab-desktop-2", parsedProductRawData)];
        let [inStockSizesEurope, outStockSizesEurope] = [getProductSizes("in", "#size-selector-tab-desktop-3", parsedProductRawData),
        getProductSizes("out", "#size-selector-tab-desktop-3", parsedProductRawData)];


        let productDetails = parsedProductRawData("#product_addtocart_form > div > div.col-sm-10 > div.cart-tools.hidden-xs > div.product-info > div.product-description.std.faded-in").text().replace("\n", "").replace("  ", " ").trim();

        console.log("progressing ", ++progress);

        return {
            "Product Name": productName,
            "Product Price": productPrice,
            "Sizes": {
                "US Men": { "In Stock": inStockSizesUSMen, "Out Stock": outStockSizesUSMen },
                "US Women": { "In Stock": inStockSizesUSWomen, "Out Stock": outStockSizesWomen },
                "UK": { "In Stock": inStockSizesUK, "Out Stock": outStockSizesUK },
                "Europe": { "In Stock": inStockSizesEurope, "Out Stock": outStockSizesEurope }
            },
            "Product Details": productDetails
        };



    }
    catch (error) {
        console.log(error);
    }
};


function getProductSizes(stock, tagID, rawData) {
    let stockSizes = [];
    rawData(tagID + ' > ul > li').each(function (i, e) {
        if (rawData(this).attr('data-stock') == stock) {
            stockSizes.push(rawData(this).text().replace("\n", "").trim());
        }

    });
    return stockSizes
}

async function setProductUrlsForEachSubCategory(categoriesData)
{
    await Promise.all(categoriesData.map(data => getProductUrls(data.SubCategoryURL, data.Category, data.SubCategory)
    .then(productUrls => categoriesData.find((o, i) => {
        if (o.Category == data.Category && o.SubCategory == data.SubCategory) {
            categoriesData[i]["Product Urls"] = productUrls;
            return true; // stop searching
        }
    }))));
}

async function getProductsDataForEachProduct(categoriesData)
{
    let productsData = {};
    await asyncForEach(categoriesData, async (data) => {
        if (!productsData.hasOwnProperty(data.Category)) {
            productsData[data.Category] = {};
        }
        productsData[data.Category][data.SubCategory] = [];

        await asyncForEach(data["Product Urls"], async (url) => {
            productsData[data.Category][data.SubCategory].push(await getProductData(url));
            await waitFor(3000);
        });
        console.log(productsData[data.Category][data.SubCategory]);
        fs.writeFileSync('./' + data.Category + '_' + data.SubCategory +  '.json', JSON.stringify(productsData[data.Category][data.SubCategory], null, 2), 'utf-8');

    });
}

const scrapeWebsiteData = async (url) => {
    let categoriesData = await scrapeCategoriesData(url)
    .then(CategoriesData => CategoriesData);

    await setProductUrlsForEachSubCategory(categoriesData);
    

    console.log(categoriesData);
    

    let productsData = await getProductsDataForEachProduct(categoriesData);


    fs.writeFileSync('./FinalOutput.json', JSON.stringify(productsData, null, 2), 'utf-8');
}

const waitFor = (ms) => new Promise(r => setTimeout(r, ms));

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

scrapeWebsiteData("https://www.hypedc.com/au");












