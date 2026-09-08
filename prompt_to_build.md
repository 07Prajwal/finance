Hey,
I want to build a website(index.html) which is all rounder finance app.

1. I have consolidated finance tracktion, with-it expense tracker, more like a logger can be added.
nice feature to track where I'm spending, how much I'm spending. visual representation.
/Users/prajwal/Documents/mac_project/Finance_Tracker.numbers

2. I also have portfolio tracker, it has all the data of investments (indian stocks, mutual fund, foreign stocks)
a similar visual tracker can be be added to have a look of these data, if possible fetch real time stock values instead of relying of excel live fetch.
/Users/prajwal/Documents/mac_project/Portfolio.numbers

Note: these files I have shared are just a local copy and will not be well maintained.
rather I will be having these files under my icloud, and I would like to move the index.html too in the icloud once built, so that it can fetch real time data from the actual real files.

3. Can we also add features like SIP Calculator, Setp up SIR calculater, lumpsum calculator, emi calculator.
(similar to how GROWW website has). It would be a nice feature to have all at one place.

4. we will build in future as needed.

I want the page to look similar to apple website. I have a desgin doc which good help in building it.
Refer it and see if it could be helpful: /Users/prajwal/Documents/mac_project/apple.com-design.md


Okay,
1. I want to build a website which can be accessed through my Mac, and also through my iphone, and also is possible should be able to share to someone I know, so that they can go through.

2. Make sure data is not lost when closed/ opened freshly on new device/ or when close everywhere.

Note: please look for a free method. I dont want to pay.

3. Lets make data secure, shall we add a password or something for the website, so that no one can acess the website without password. Also lets make sure our data base is secure and no one can access it.

Improvements in website:
1. in the overview page, lets keep investment and spends separate. it currently looks all in one.

2. add expense option is good. but can we make it better. like, instead of click and filling all the fields everywhere they are, lets go like, click add expense, add date, either today or select which you want. then next pop up saying enter amount, once entered, then type pop up, once selected category pop ups, and so on.

3. lets also add delete expense option here, so that if something is entered mistakenly, it can be removed.
but also lets make sure data is deleted by miss click.

4. should we add some UT or something to make sure things are working as expected and verified?
It should help identify issues more easily.
"Foreign stocks" calculations from dolar, euro and rupee conversion works well.

5. current value, invested, unrealised gain, are good to have on display, but remove "Foreign sleeve" instead add "Unrealised P/L percentage" may be.

6. stock tables are good. but can we also add totals at the end of respective table, please.

7. Also add a feature to add when stock is bought, 
and also lets add a feature to update when a stock is sold, and update respectively. therefore, also have realised gain option display as well.

8. calculators are good, but the scroll function isn't smooth, can that be optimized please.
also can we also have a option enter amount, and not just scroll option.
also cover corner ccondition, indicating "cant be 0 years", "amount can be negative" things like that. You get the point.

9. the graph isnt looking good. aand also under each section, I believe the labels should change, but for example I can see "Est. returns" is stuck even for emi page.

10. I think now that we are moving away from excel/numbers doc we can remove anything related to that from the website. 

11. again iterating, I think it is better to have UTs for all the things, so that everything is tested.

08/09/2026 - 01
1. It would be better to add limits in calculators.
    i. SIP has a good limits. but lets increase max to 2,00,000. And also time period to 50 years max(lets limit this everywhere, currently 1000 years could be selected, which isn't proper).
    ii. same with step-up
    iii. let's limit lumsump to 1,00,00,000
    iv. EMI lets put max limit of 2,00,00,000.

2. If possible lets add "," separator for number which are caluculated in rupees. And also try to have indian number system "separator" than global system.
Example, lets have 2,00,000 instead of 200,000

3. "— designed to feel as simple as Apple." remove these type of things from website.

4. I dont think "http://localhost:8080/" these can be bookmarked from iphone and opened. nor can I share this URL to a friend to check it out. let's come up with something better

08/09/2026 - 02
1. As soon as the website open, there's a blonk page. when clicked on something it disappears. why is that? that shouldn't happen.

2. Looks like only investments data are loaded. expense data is fully missing.

3. when clicked on "Update live prices" - facing "Live fetch was blocked. Last saved prices are still shown"

4. graphically representation of "By category" and "By type" is good, can we have an option of selecting "All, Our Expense, Home Expense, My Expense"

5. the main reason for inital creation of "numbers" was to 
    i. using shortcut update whenever I pay through UPI (When google pay is closed, automation starts) ask the expense related quries and update in the sheet. so that I have a way to track and also update without forgetting, How do you think will be usefull now to update expense using our webpage?
    ii. another shortcut was created to run everyday twice (morning 10am and evening 4pm) to log current stock info. so that down the line, after few years I could track down how its performing, when it went down, when it came up. How can we achive that from our website?