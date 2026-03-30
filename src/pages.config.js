/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AllUsers from './pages/AllUsers';
import CoachProfile from './pages/CoachProfile';
import ConversionDashboard from './pages/ConversionDashboard';
import Dashboard from './pages/Dashboard';
import FinancialDebug from './pages/FinancialDebug';
import FinancialOverview from './pages/FinancialOverview';
import Home from './pages/Home';
import Leads from './pages/Leads';
import MyAttendance from './pages/MyAttendance';
import MyPlan from './pages/MyPlan';
import MyWorkoutLog from './pages/MyWorkoutLog';
import Notifications from './pages/Notifications';
import Onboarding from './pages/Onboarding';
import Progress from './pages/Progress';
import Reports from './pages/Reports';
import SectionTemplates from './pages/SectionTemplates';
import Sessions from './pages/Sessions';
import TraineeHome from './pages/TraineeHome';
import TraineeProfile from './pages/TraineeProfile';
import TrainingPlans from './pages/TrainingPlans';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AllUsers": AllUsers,
    "CoachProfile": CoachProfile,
    "ConversionDashboard": ConversionDashboard,
    "Dashboard": Dashboard,
    "FinancialDebug": FinancialDebug,
    "FinancialOverview": FinancialOverview,
    "Home": Home,
    "Leads": Leads,
    "MyAttendance": MyAttendance,
    "MyPlan": MyPlan,
    "MyWorkoutLog": MyWorkoutLog,
    "Notifications": Notifications,
    "Onboarding": Onboarding,
    "Progress": Progress,
    "Reports": Reports,
    "SectionTemplates": SectionTemplates,
    "Sessions": Sessions,
    "TraineeHome": TraineeHome,
    "TraineeProfile": TraineeProfile,
    "TrainingPlans": TrainingPlans,
}

export const pagesConfig = {
    mainPage: "Onboarding",
    Pages: PAGES,
    Layout: __Layout,
};