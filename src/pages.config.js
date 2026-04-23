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
import ActivePlans from './pages/ActivePlans';
import AllUsers from './pages/AllUsers';
import Forms from './pages/Forms';
import CoachProfile from './pages/CoachProfile';
import Dashboard from './pages/Dashboard';
import FinancialDebug from './pages/FinancialDebug';
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
import TraineeSessions from './pages/TraineeSessions';
import TraineeProfile from './pages/TraineeProfile';
import PlanBuilder from './pages/PlanBuilder';
import TrainingPlans from './pages/TrainingPlans';
import TrainingPlanView from './pages/TrainingPlanView';
import Clocks from './pages/Clocks';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ActivePlans": ActivePlans,
    "AllUsers": AllUsers,
    "Forms": Forms,
    "CoachProfile": CoachProfile,
    "Dashboard": Dashboard,
    "FinancialDebug": FinancialDebug,
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
    "TraineeSessions": TraineeSessions,
    "TraineeProfile": TraineeProfile,
    "PlanBuilder": PlanBuilder,
    "TrainingPlans": TrainingPlans,
    "TrainingPlanView": TrainingPlanView,
    "Clocks": Clocks,
}

export const pagesConfig = {
    mainPage: "Onboarding",
    Pages: PAGES,
    Layout: __Layout,
};